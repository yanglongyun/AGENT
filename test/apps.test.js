// 实际启动随仓库分发的三个应用；使用临时数据和本地模型桩，不调用外部模型。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createApps } from '../server/apps/registry.js';
import { createSupervisor } from '../server/apps/supervisor.js';
import { createBridge } from '../server/apps/bridge.js';
import { createTurns } from '../server/run/turn.js';
import { openDatabase, createStore } from '../server/store.js';
import config from '../config.example.js';
import { ROOT } from '../shared/root.js';

const listen = async (server) => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = async (server) => { server.closeAllConnections(); await new Promise((done) => server.close(done)); };
async function json(url, body) {
    const response = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.ok(response.ok, `${url}: ${response.status}`);
    return response.json();
}

test('三个初始应用可启动、读写，Ramify 和导图生成经过宿主并记录任务', { timeout: 20_000 }, async (t) => {
    const data = mkdtempSync(join(tmpdir(), 'agent-apps-'));
    const db = openDatabase(':memory:');
    const store = createStore(db);
    const requests = [];
    let generatedChildren = ['产品方向', '技术方向', '运营方向'];
    let generationGate = null;
    const model = http.createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        requests.push(body);
        if (body.text?.format?.name === 'mindmap_children' && generationGate) await generationGate;
        const text = body.text?.format?.name === 'mindmap_children'
            ? JSON.stringify({ children: generatedChildren })
            : body.text?.format?.type === 'json_schema'
            ? JSON.stringify({ directions: [{ title: '测试方向', type: 'markdown', idea: '写一份完整说明' }] })
            : '# 初始应用\n\n这是一份通过宿主补全生成的说明文档。';
        const item = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] };
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.end(`data: ${JSON.stringify({ type: 'response.output_item.done', item })}\n\ndata: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 5, output_tokens: 10 } } })}\n\n`);
    });
    let bridge;
    const host = http.createServer((req, res) => { void bridge(req, res, req.url.slice('/host'.length)); });
    let supervisor;
    t.after(async () => {
        if (supervisor) await supervisor.stopAll();
        await close(host); await close(model); db.close();
        rmSync(data, { recursive: true, force: true });
    });
    const modelPort = await listen(model);
    const hostPort = await listen(host);
    store.setSettings({ responsesUrl: `http://127.0.0.1:${modelPort}/responses`, apiKey: 'local-test', model: 'local-test' });
    const local = { ...config, port: hostPort, appsDir: join(ROOT, 'apps'), appDataDir: data, retry: { enabled: false } };
    const channel = { broadcast() {} };
    const apps = createApps({ config: local });
    assert.deepEqual(apps.list().map((app) => app.id).sort(), ['mindmap', 'notes', 'ramify']);
    assert.ok(apps.list().every((app) => !app.invalid && app.hasDoc));
    supervisor = createSupervisor({ config: local, apps });
    const turns = createTurns({ config: local, store, files: { prepareInput: async (items) => items }, apps, broadcast: channel.broadcast });
    bridge = createBridge({ config: local, store, apps, supervisor, channel, turns });
    const origins = {};
    for (const id of ['mindmap', 'notes', 'ramify']) {
        const running = await supervisor.ensure(id);
        origins[id] = `http://127.0.0.1:${running.port}`;
        assert.equal(running.status, 'ready');
        const response = await fetch(origins[id]);
        assert.equal(response.status, 200);
        const html = await response.text();
        for (const [, path] of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
            if (/^(?:https?:|data:|#)/.test(path)) continue;
            assert.equal((await fetch(new URL(path, origins[id]))).status, 200);
        }
    }
    const page = await json(`${origins.notes}/api/pages`, { title: '测试笔记' });
    assert.equal((await json(`${origins.notes}/api/pages/${page.id}`)).title, '测试笔记');
    const map = JSON.parse(execFileSync(process.execPath, [join(ROOT, 'apps/mindmap/scripts/mindmap.mjs'), 'map', 'create', '--name', '测试导图'], { env: { ...process.env, APP_DATA_DIR: join(data, 'mindmap') }, encoding: 'utf8' }));
    const maps = await json(`${origins.mindmap}/api/sql`, { query: 'SELECT * FROM app_mindmap_maps m ORDER BY updated_at DESC', params: [] });
    assert.ok(maps.rows.some((row) => row.id === map.id));
    const project = await json(`${origins.ramify}/api/projects`, { prompt: '测试说明', title: '测试', count: 1 });
    await json(`${origins.ramify}/api/projects/${project.id}/generate`, { prompt: '测试说明', count: 1, nodeIds: project.nodeIds });
    let source;
    for (let i = 0; i < 100; i++) {
        const response = await fetch(`${origins.ramify}/api/nodes/${project.nodeIds[0]}/artifact/source`);
        if (response.ok) { const value = await response.json(); if (value.source) { source = value.source; break; } }
        await delay(30);
    }
    assert.match(source || '', /通过宿主补全生成/);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].text.format.name, 'directions');
    assert.equal(requests[0].text.format.strict, true);
    assert.equal(requests[0].text.format.schema.type, 'object');
    assert.equal(requests[1].text, undefined, '下一次普通生成不继承结构化格式');
    assert.equal(store.listTasks().length, 2);
    assert.ok(store.listTasks().every((task) => task.status === 'completed'));
    assert.ok(store.listTasks().every((task) => store.listMessages(task.id).messages.length === 2));
    const invalid = await fetch(`http://127.0.0.1:${hostPort}/host/ai/complete`, { method: 'POST', headers: { authorization: `Bearer ${supervisor.tokenFor('ramify')}`, 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'test', schema: [] }) });
    assert.equal(invalid.status, 400);
    assert.equal(store.listTasks().length, 2, '无效请求不创建任务');

    const topics = () => json(`${origins.mindmap}/api/sql`, { query: 'SELECT * FROM app_mindmap_topics WHERE map_id = ?', params: [map.id] });
    const generated = await json(`${origins.mindmap}/api/generate`, { map: map.id, topic: map.rootId, count: 3 });
    assert.deepEqual(generated.topics.map((topic) => topic.text), generatedChildren);
    assert.ok(generated.topics.every((topic) => topic.parent_id === map.rootId));
    assert.equal((await topics()).rows.length, 4);
    assert.equal(store.getThread(generated.task).status, 'completed');
    assert.equal(store.listMessages(generated.task).messages.length, 2);
    assert.equal(requests.at(-1).text.format.name, 'mindmap_children');
    assert.equal(JSON.parse(requests.at(-1).input[0].content).count, 3);

    generatedChildren = [''];
    const invalidChildren = await fetch(`${origins.mindmap}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ map: map.id, topic: map.rootId, count: 1 }) });
    assert.equal(invalidChildren.status, 400);
    assert.equal((await topics()).rows.length, 4, '模型返回空节点时整批不写入');

    let release;
    generationGate = new Promise((resolve) => { release = resolve; });
    generatedChildren = ['新方向'];
    const beforeRequests = requests.length;
    const pending = fetch(`${origins.mindmap}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ map: map.id, topic: map.rootId, count: 1 }) });
    for (let i = 0; i < 100 && requests.length === beforeRequests; i++) await delay(10);
    assert.equal(requests.length, beforeRequests + 1);
    await json(`${origins.mindmap}/api/sql`, { query: 'UPDATE app_mindmap_topics SET text = ? WHERE id = ?', params: ['手动修改', generated.topics[0].id] });
    const duplicate = await fetch(`${origins.mindmap}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ map: map.id, topic: map.rootId, count: 1 }) });
    assert.equal(duplicate.status, 400);
    release(); generationGate = null;
    assert.equal((await pending).status, 200);
    const finalTopics = (await topics()).rows;
    assert.equal(finalTopics.length, 5);
    assert.equal(finalTopics.find((topic) => topic.id === generated.topics[0].id).text, '手动修改', '生成时的其他编辑被保留');
    // 旧数据可能存在相同 sort_order，不能只交换两个相等的数。
    await json(`${origins.mindmap}/api/sql`, { query: 'UPDATE app_mindmap_topics SET sort_order = ? WHERE id = ?', params: [0, generated.topics[1].id] });
    const reordered = await json(`${origins.mindmap}/api/reorder`, { map: map.id, topic: generated.topics[0].id, direction: 1 });
    assert.deepEqual(reordered.topics.map((topic) => topic.text), ['技术方向', '手动修改', '运营方向', '新方向']);
    assert.deepEqual((await topics()).rows.filter((topic) => topic.parent_id === map.rootId).map((topic) => topic.text), ['技术方向', '手动修改', '运营方向', '新方向']);
    const reversed = await json(`${origins.mindmap}/api/reorder`, { map: map.id, topic: generated.topics[0].id, direction: -1 });
    assert.equal(reversed.topics[0].text, '手动修改');
    const child = (await json(`${origins.mindmap}/api/sql`, { query: 'INSERT INTO app_mindmap_topics (map_id, parent_id, text, side, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id', params: [map.id, generated.topics[0].id, '保留子树', 'right', 0, Date.now(), Date.now()] })).rows[0];
    const placed = await json(`${origins.mindmap}/api/reorder`, { map: map.id, topic: generated.topics[0].id, target: generated.topics[2].id, placement: 'after' });
    assert.deepEqual(placed.topics.map((topic) => topic.text), ['技术方向', '运营方向', '手动修改', '新方向']);
    const placedFirst = await json(`${origins.mindmap}/api/reorder`, { map: map.id, topic: generated.topics[0].id, target: generated.topics[1].id, placement: 'before' });
    assert.equal(placedFirst.topics[0].text, '手动修改');
    const preserved = (await topics()).rows;
    assert.equal(preserved.find((topic) => topic.id === child.id).parent_id, generated.topics[0].id, '拖动排序保留整棵子树');
    const invalidDrop = await fetch(`${origins.mindmap}/api/reorder`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ map: map.id, topic: child.id, target: generated.topics[1].id, placement: 'before' }) });
    assert.equal(invalidDrop.status, 400, '插入位置必须属于同级节点');

});
