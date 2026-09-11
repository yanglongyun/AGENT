import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { openDatabase, createStore } from '../server/store.js';
import { createApi } from '../server/api/index.js';
import { createTurns } from '../server/run/turn.js';
import { createApprovals } from '../server/run/approvals.js';
import { createBridge } from '../server/apps/bridge.js';
import config from '../config.example.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test('HTTP：聊天、任务、消息分页、旧接口移除、任务取消和级联删除', async (t) => {
    const db = openDatabase(':memory:');
    const store = createStore(db);
    const channel = { broadcast() {} };
    const files = { normalizeMany: () => [], prepareInput: async (items) => items };
    const approvals = createApprovals({ broadcast: channel.broadcast });
    const turns = createTurns({ config, store, files, approvals, broadcast: channel.broadcast });
    const handle = createApi({ config, store, files, approvals, turns, channel, meta: { version: 'test' } });
    const server = http.createServer((req, res) => { void handle(req, res, new URL(req.url, 'http://localhost')); });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); db.close(); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (path, method = 'GET', body) => {
        const response = await realFetch(base + path, { method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
        return { status: response.status, body: await response.json() };
    };
    const chat = (await call('/api/chats', 'POST', { title: 'Chat', rules: '初始规则' })).body.thread;
    assert.equal((await call('/api/tasks', 'POST', { title: 'Task' })).status, 405);
    assert.equal(store.listTasks().length, 0);
    const task = store.createThread({ type: 'task', title: 'App task fixture' });
    assert.equal((await call(`/api/threads/${task.id}/messages`, 'POST', { content: '继续' })).status, 405);
    assert.equal(store.listMessages(task.id).messages.length, 0);
    assert.deepEqual(turns.ids(), []);
    assert.equal(chat.rules, '初始规则');
    assert.equal((await call(`/api/threads/${chat.id}`, 'PATCH', { rules: '新规则' })).body.thread.rules, '新规则');
    assert.equal((await call(`/api/threads/${chat.id}`)).body.thread.rules, '新规则');
    for (const rules of [null, [], 123, 'x'.repeat(20001)]) {
        assert.equal((await call('/api/chats', 'POST', { rules })).status, 400);
        assert.equal((await call(`/api/threads/${chat.id}`, 'PATCH', { rules })).status, 400);
    }
    assert.equal((await call(`/api/threads/${task.id}`, 'PATCH', { rules: '不允许' })).status, 400);
    assert.equal((await call(`/api/threads/${chat.id}`, 'PATCH', { rules: '' })).body.thread.rules, '');
    assert.equal(chat.type, 'chat');
    assert.equal(task.status, 'pending');
    assert.equal('workdir' in chat, false);
    const proposed = store.createProposal(chat.id, { kind: 'rule', summary: '测试', detail: '原因', text: '规则' });
    assert.equal((await call(`/api/threads/${chat.id}/proposals`)).body.proposals.length, 1);
    assert.equal((await call(`/api/threads/${task.id}/proposals/${proposed.id}`, 'POST', { answer: 'accept' })).status, 404);
    assert.equal((await call(`/api/threads/${chat.id}/proposals/${proposed.id}`, 'POST', { answer: 'accept' })).status, 200);
    assert.equal(store.getThread(chat.id).rules, '规则');
    assert.equal((await call(`/api/threads/${chat.id}/proposals/${proposed.id}`, 'POST', { answer: 'ignore' })).status, 409);
    const a = store.append(chat.id, { role: 'user', content: 'A' });
    store.append(task.id, { role: 'user', content: 'B' });
    const c = store.append(chat.id, { role: 'user', content: 'C' });
    const page = await call(`/api/threads/${chat.id}/messages?before=${c.id}`);
    assert.deepEqual(page.body.messages.filter((row) => row.item.kind !== 'proposal').map((row) => row.id), [a.id]);
    assert.equal('seq' in page.body.messages[0], false);
    assert.equal((await call(`/api/threads/${chat.id}/messages?limit=1.5`)).status, 400);
    for (const path of ['/api/rules', '/api/proposals', '/api/conversations']) assert.equal((await call(path)).status, 404);
    assert.deepEqual(Object.keys((await call('/api/meta')).body).sort(), ['model', 'version']);
    assert.equal((await call(`/api/threads/${task.id}`, 'PATCH', { status: 'cancelled' })).body.thread.status, 'cancelled');
    assert.equal((await call(`/api/threads/${task.id}`, 'PATCH', { pinned: true })).status, 400);
    await call(`/api/threads/${chat.id}`, 'DELETE');
    assert.equal((await call(`/api/threads/${chat.id}/messages`)).status, 404);
    assert.equal(store.listMessages(task.id).messages.length, 1);
});

test('App 两种模型入口都保存任务和消息，Agent 不带规则提议工具', async (t) => {
    const db = openDatabase(':memory:');
    const store = createStore(db);
    store.setSettings({ responsesUrl: 'https://mock/responses', apiKey: 'k', model: 'm' });
    const channel = { broadcast() {} };
    const files = { prepareInput: async (items) => items };
    const turns = createTurns({ config, store, files, broadcast: channel.broadcast });
    const apps = { get: () => ({ id: 'demo', permissions: ['ai.complete', 'ai.agent'] }) };
    const bridge = createBridge({ config, store, apps, supervisor: { identify: () => 'demo' }, channel, turns });
    const server = http.createServer((req, res) => { void bridge(req, res, req.url); });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); db.close(); });
    globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        assert.ok(!body.tools.some((tool) => ['confirm', 'propose'].includes(tool.name)));
        const item = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done' }] };
        return new Response(`data: ${JSON.stringify({ type: 'response.output_item.done', item })}\n\ndata: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', usage: {} } })}\n\n`);
    };
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (path) => realFetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test' }, body: JSON.stringify({ prompt: 'Hello', title: 'API test' }) });
    const completed = await (await request('/ai/complete')).json();
    assert.equal(completed.text, 'Done');
    assert.equal(store.getThread(completed.task).status, 'completed');
    const streamed = await (await request('/ai/agent')).text();
    assert.match(streamed, /event: task/);
    assert.match(streamed, /event: done/);
    assert.equal(store.listTasks().length, 2);
    for (const task of store.listTasks()) {
        assert.equal(task.status, 'completed');
        assert.equal(store.listMessages(task.id).messages.length, 2);
    }
});
