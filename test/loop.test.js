// 端到端冒烟：模型 → 工具 → 模型。桩 fetch，真实文件工具。
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgent } from '../agent/index.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const sse = (events) => new ReadableStream({
    start(controller) {
        for (const event of events) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        controller.close();
    },
});
const ok = (events) => new Response(sse(events), { status: 200 });

const BASH = { executable: '/bin/sh', args: ['-lc'], minTimeoutMs: 100, defaultTimeoutMs: 5_000, maxTimeoutMs: 10_000, maxOutputChars: 4_000 };

const options = (cwd, extra = {}) => ({
    runId: 'r1',
    responsesUrl: 'https://x/v1/responses',
    apiKey: 'k',
    model: 'm',
    input: [{ role: 'user', content: 'go' }],
    maxRounds: 8,
    errorMaxChars: 400,
    workdir: cwd,
    env: {},
    bash: BASH,
    retry: { baseDelayMs: 1 },
    ...extra,
});

test('模型调用 edit 后再收尾，工具真的落盘', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'agent-loop-'));
    await writeFile(join(cwd, 'a.js'), 'const v = OLD;\n', 'utf8');

    let round = 0;
    globalThis.fetch = async () => {
        round += 1;
        if (round === 1) {
            return ok([{
                type: 'response.output_item.done',
                item: {
                    type: 'function_call',
                    call_id: 'c1',
                    name: 'edit',
                    arguments: JSON.stringify({ path: 'a.js', old_text: 'OLD', new_text: '"$&"' }),
                },
            }, { type: 'response.completed', response: { status: 'completed', usage: {} } }]);
        }
        return ok([
            { type: 'response.output_item.done', item: { type: 'message', content: [{ text: '好了' }] } },
            { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 9 } } },
        ]);
    };

    const result = await runAgent(options(cwd));
    assert.equal(round, 2);
    assert.equal(await readFile(join(cwd, 'a.js'), 'utf8'), 'const v = "$&";\n', '$& 一路到落盘都没被解释');
    assert.equal(result.status, 'completed');
    assert.ok(result.items.some((item) => item.type === 'function_call_output'));
});

test('截断原因穿透 runAgent 与 DONE 事件', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'agent-loop-'));
    globalThis.fetch = async () => ok([
        { type: 'response.output_item.done', item: { type: 'message', content: [{ text: '半句' }] } },
        { type: 'response.incomplete', response: { status: 'incomplete', usage: {}, incomplete_details: { reason: 'max_output_tokens' } } },
    ]);

    const done = [];
    const result = await runAgent(options(cwd, { emit: (type, data) => { if (type === 'done') done.push(data); } }));
    assert.equal(result.stopReason, 'max_output_tokens');
    assert.equal(result.status, 'incomplete');
    assert.equal(done[0].status, 'incomplete');
    assert.equal(done[0].stopReason, 'max_output_tokens');
});

test('重试事件透到 emit，且重试后循环继续', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'agent-loop-'));
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        if (calls === 1) return new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 503 });
        return ok([
            { type: 'response.output_item.done', item: { type: 'message', content: [{ text: 'ok' }] } },
            { type: 'response.completed', response: { status: 'completed', usage: {} } },
        ]);
    };
    const retries = [];
    const result = await runAgent(options(cwd, { emit: (type, data) => { if (type === 'retry') retries.push(data); } }));
    assert.equal(calls, 2);
    assert.equal(retries.length, 1);
    assert.equal(result.status, 'completed');
});
