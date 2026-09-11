import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createStore } from '../server/store.js';
import { createTurns } from '../server/run/turn.js';
import { createApprovals } from '../server/run/approvals.js';
import { createRunner } from '../agent/runner.js';
import config from '../config.example.js';
import { ROOT } from '../shared/root.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const ok = (items) => new Response(items.map((item) => `data: ${JSON.stringify({ type: 'response.output_item.done', item })}\n\n`).join('') + `data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 2, output_tokens: 1 } } })}\n\n`);
const answer = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '完成' }] };
function setup(t, extra = {}) {
    const db = openDatabase(':memory:');
    t.after(() => db.close());
    const store = createStore(db);
    store.setSettings({ responsesUrl: 'https://mock/responses', apiKey: 'test', model: 'test' });
    const events = [];
    const broadcast = (type, data) => events.push({ type, ...data });
    const approvals = createApprovals({ broadcast, timeoutMs: 100 });
    const deps = { config: { ...config, retry: { enabled: false }, ...extra }, store, files: { prepareInput: async (items) => items }, approvals, broadcast };
    const turns = createTurns(deps);
    return { db, store, turns, events, deps };
}

test('任务完整运行、消息落库、状态完成、再次执行清除结束时间', async (t) => {
    const { store, turns } = setup(t);
    globalThis.fetch = async () => ok([answer]);
    const task = store.createThread({ type: 'task', title: '测试' });
    const run = turns.start(task, '开始');
    assert.equal(store.getThread(task.id).status, 'running');
    assert.equal((await run.finished).status, 'completed');
    assert.equal(store.getThread(task.id).status, 'completed');
    assert.ok(store.getThread(task.id).finished);
    assert.equal(store.listMessages(task.id).messages.length, 2);
    assert.throws(() => store.setPinned(task.id, true), /只有聊天/);
    const next = turns.start(store.getThread(task.id), '继续');
    assert.equal(store.getThread(task.id).finished, null);
    await next.finished;
    assert.equal(store.listMessages(task.id).messages.length, 4);
});

test('摘要请求失败：任务失败，历史保留，没有压缩记录或替代摘要', async (t) => {
    const { store, db, turns } = setup(t, { compaction: { ...config.compaction, contextWindowTokens: 100, tailKeepChars: 500 } });
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('summary unavailable', { status: 503 }); };
    const task = store.createThread({ type: 'task', title: '摘要失败' });
    const history = Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: '内容'.repeat(2000) }));
    for (const item of history) store.append(task.id, item);
    store.saveContext(task.id, history, { input_tokens: 100 });
    const run = turns.start(store.getThread(task.id), '继续');
    assert.equal((await run.finished).status, 'failed');
    assert.equal(calls, 1);
    assert.equal(store.getThread(task.id).status, 'failed');
    assert.equal(db.prepare('SELECT count(*) AS n FROM compactions').get().n, 0);
    assert.deepEqual(store.getThread(task.id).context.slice(0, history.length), history);
    assert.ok(store.getThread(task.id).context.every((item) => item.kind !== 'compaction'));
});

test('停止后暂停、等待收尾才能删除，不能产生孤儿消息', async (t) => {
    const { store, turns, db } = setup(t);
    let entered;
    const ready = new Promise((resolve) => { entered = resolve; });
    globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
        entered();
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    const task = store.createThread({ type: 'task', title: '停止' });
    const run = turns.start(task, '等待');
    await ready;
    assert.throws(() => turns.start(store.getThread(task.id), '重复'), /正在运行/);
    await turns.stopAndWait(task.id);
    assert.equal((await run.finished).status, 'aborted');
    assert.equal(store.getThread(task.id).status, 'paused');
    assert.equal(store.getThread(task.id).finished, null);
    store.deleteThread(task.id);
    assert.equal(db.prepare('SELECT count(*) AS n FROM messages').get().n, 0);
    assert.deepEqual(turns.ids(), []);
});

test('异常退出的运行任务恢复为暂停，补齐悬空工具调用后可继续', async (t) => {
    const { store, deps } = setup(t);
    const task = store.createThread({ type: 'task', title: '恢复' });
    const call = { type: 'function_call', call_id: 'unfinished', name: 'read', arguments: '{}' };
    store.record(task.id, call, [call], null);
    store.setStatus(task.id, 'running');
    const turns = createTurns(deps);
    assert.equal(store.getThread(task.id).status, 'paused');
    globalThis.fetch = async (_url, init) => {
        const input = JSON.parse(init.body).input;
        assert.ok(input.some((item) => item.type === 'function_call_output' && item.call_id === 'unfinished'));
        return ok([answer]);
    };
    assert.equal((await turns.start(store.getThread(task.id), '继续').finished).status, 'completed');
});

test('工具基准固定为项目根目录，无需传工作目录', async () => {
    const run = createRunner({ shell: config.shell, env: process.env });
    const result = await run({ name: 'shell', call_id: 'pwd', arguments: JSON.stringify({ command: 'pwd' }) });
    const output = JSON.parse(result.output);
    assert.equal(output.exit_code, 0);
    assert.equal(output.stdout.trim().replace(/\/$/, ''), ROOT.replace(/\/$/, ''));
});

test('单次补全也作为任务记录消息和状态', async (t) => {
    const { store, turns } = setup(t);
    globalThis.fetch = async (_url, init) => {
        assert.deepEqual(JSON.parse(init.body).tools, []);
        return ok([answer]);
    };
    const task = store.createThread({ type: 'task', title: '补全' });
    const result = await turns.start(task, '请求', [], '', { single: true, interactive: false }).finished;
    assert.equal(result.text, '完成');
    assert.equal(store.getThread(task.id).status, 'completed');
    assert.equal(store.listMessages(task.id).messages.length, 2);
});


test('全局提示词与本对话规则组合，每轮读取最新规则且不会串入其他聊天或任务', async (t) => {
    const { store, turns } = setup(t);
    store.setSettings({ instructions: '全局要求' });
    const requests = [];
    globalThis.fetch = async (_url, init) => { requests.push(JSON.parse(init.body)); return ok([answer]); };
    const a = store.createThread({ title: 'A', rules: '甲规则' });
    const b = store.createThread({ title: 'B', rules: '乙规则' });
    const task = store.createThread({ type: 'task', title: 'App' });
    const run = async (thread) => assert.equal((await turns.start(thread, '开始', [], '', { single: true }).finished).status, 'completed');
    await run(a);
    store.setRules(a.id, '更新规则');
    await run(a);
    await run(b);
    await run(task);
    store.setRules(a.id, '');
    await run(a);
    for (const request of requests) assert.match(request.instructions, /全局要求/);
    assert.match(requests[0].instructions, /甲规则/);
    assert.match(requests[1].instructions, /更新规则/);
    assert.doesNotMatch(requests[1].instructions, /甲规则|乙规则/);
    assert.match(requests[2].instructions, /乙规则/);
    assert.doesNotMatch(requests[2].instructions, /甲规则|更新规则/);
    assert.doesNotMatch(requests[3].instructions, /本对话规则|甲规则|乙规则|更新规则/);
    assert.doesNotMatch(requests[4].instructions, /本对话规则|更新规则/);
});

test('propose 不等待用户，模型继续回复，提议保持待处理且规则未经同意不生效', async (t) => {
    const { store, turns } = setup(t);
    const chat = store.createThread({ title: '提议测试' });
    let requests = 0;
    globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        assert.ok(body.tools.some((tool) => tool.name === 'propose'));
        if (++requests === 1) return ok([{ type: 'function_call', call_id: 'proposal1', name: 'propose', arguments: JSON.stringify({ kind: 'rule', summary: '中文回答', detail: '保持语言一致', old_text: '', new_text: '请使用中文回答' }) }]);
        const result = body.input.find((item) => item.type === 'function_call_output');
        assert.equal(JSON.parse(result.output).status, 'pending');
        return ok([answer]);
    };
    assert.equal((await turns.start(chat, '开始').finished).status, 'completed');
    assert.equal(requests, 2);
    assert.equal(store.listProposals(chat.id).length, 1);
    assert.equal(store.getThread(chat.id).rules, '');
});
