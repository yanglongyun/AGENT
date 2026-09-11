import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, createStore } from '../server/store.js';

function setup(t) {
    const db = openDatabase(':memory:');
    t.after(() => db.close());
    return { db, store: createStore(db) };
}
const item = (text) => ({ role: 'user', content: text });
const summary = (text) => ({ role: 'user', kind: 'compaction', content: text });

test('仅五张业务表，字段均为单词，无 seq、workdir、kind 或 started', (t) => {
    const { db } = setup(t);
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name), ['chats', 'compactions', 'messages', 'settings', 'tasks']);
    const expected = {
        chats: ['id', 'title', 'rules', 'pinned', 'context', 'usage', 'created', 'updated'],
        tasks: ['id', 'title', 'status', 'context', 'usage', 'created', 'updated', 'finished'],
        messages: ['id', 'thread', 'item', 'created'],
        compactions: ['thread', 'first', 'last', 'summary', 'tokens', 'created'],
        settings: ['key', 'value'],
    };
    for (const [table, fields] of Object.entries(expected)) assert.deepEqual(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name), fields);
});

test('聊天和任务交错写入、按全局 ID 翻页、跨表唯一和删除归属', (t) => {
    const { db, store } = setup(t);
    const chat = store.createThread({ title: '聊天' });
    const task = store.createThread({ type: 'task', title: '任务' });
    assert.throws(() => store.createThread({ type: 'task', id: chat.id, title: '冲突' }), /ID 已存在/);
    assert.throws(() => store.append('missing', item('孤儿')), /不存在/);
    const a = store.append(chat.id, item('a'));
    const b = store.append(task.id, item('b'));
    const c = store.append(chat.id, item('c'));
    assert.ok(a.id < b.id && b.id < c.id);
    const page = store.listMessages(chat.id, { limit: 1 });
    assert.equal(page.messages[0].id, c.id);
    assert.equal(page.hasMore, true);
    assert.deepEqual(store.listMessages(chat.id, { before: c.id }).messages.map((row) => row.id), [a.id]);
    store.deleteThread(chat.id);
    assert.equal(store.listMessages(task.id).messages[0].id, b.id);
    assert.equal(db.prepare('SELECT count(*) AS n FROM messages WHERE thread = ?').get(chat.id).n, 0);
    assert.throws(() => store.append(chat.id, item('已删除')), /不存在/);
});

test('连续压缩按真实消息 ID 记账，排除摘要消息，提交失败整体回滚', (t) => {
    const { db, store } = setup(t);
    const chat = store.createThread({ title: '聊天' });
    const task = store.createThread({ type: 'task', title: '任务' });
    const ids = [];
    for (let i = 0; i < 6; i++) {
        ids.push(store.append(chat.id, item(String(i))).id);
        store.append(task.id, item('另一条线'));
    }
    const folded = [summary('摘要一'), item('4'), item('5')];
    store.compact(chat.id, { tailCount: 2, summary: '摘要一', tokens: 10, history: folded });
    let rows = db.prepare('SELECT first, last FROM compactions WHERE thread = ? ORDER BY last').all(chat.id);
    assert.deepEqual(rows.map((r) => [r.first, r.last]), [[ids[0], ids[3]]]);
    const seventh = store.append(chat.id, item('6'));
    store.append(task.id, item('穿插'));
    const eighth = store.append(chat.id, item('7'));
    store.compact(chat.id, { tailCount: 2, summary: '摘要二', tokens: 20, history: [summary('摘要二'), item('6'), item('7')] });
    rows = db.prepare('SELECT first, last FROM compactions WHERE thread = ? ORDER BY last').all(chat.id);
    assert.deepEqual(rows.map((r) => [r.first, r.last]), [[ids[0], ids[3]], [ids[4], ids[5]]]);
    assert.ok(seventh.id > ids[5] && eighth.id > seventh.id);
    const before = store.listMessages(chat.id).messages.length;
    const context = store.getThread(chat.id).context;
    assert.throws(() => store.compact(chat.id, { tailCount: 0, summary: '坏', tokens: 3, history: undefined }));
    assert.equal(store.listMessages(chat.id).messages.length, before);
    assert.deepEqual(store.getThread(chat.id).context, context);
    assert.equal(db.prepare('SELECT count(*) AS n FROM compactions').get().n, 2);
    store.deleteThread(chat.id);
    assert.equal(db.prepare('SELECT count(*) AS n FROM compactions').get().n, 0);
});

test('旧库迁移保留消息 ID、设置和摘要，移除规则，生成可恢复备份且重复启动安全', (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'agent-migration-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const file = join(directory, 'agent.db');
    const old = new DatabaseSync(file);
    old.exec(readFileSync(new URL('./fixtures/legacy.sql', import.meta.url), 'utf8'));
    old.exec(`
        INSERT INTO conversations (id,title,workdir,context_json,created_at,updated_at) VALUES ('a','旧聊天','/old','[]','a','b'), ('b','另一个','/else','[]','a','b');
        INSERT INTO messages (id,conversation_id,seq,item_json,created_at) VALUES
            (10,'a',1,'{"role":"user","content":"保留原文"}','a'),
            (11,'b',1,'{"role":"user","content":"另一条"}','a'),
            (20,'a',2,'{"role":"assistant","content":"回复"}','b');
        INSERT INTO compactions VALUES ('a',1,2,'旧模型摘要','summary',99,'b');
        INSERT INTO settings VALUES ('model','my-model'),('rulesEnabled','on'),('rulesSeeded','1');
        INSERT INTO rules VALUES ('r','旧规则',1,0,'a');
    `);
    old.close();
    const db = openDatabase(file);
    const store = createStore(db);
    assert.equal(store.getThread('a').title, '旧聊天');
    assert.deepEqual(store.listMessages('a').messages.map((r) => r.id), [10, 20]);
    assert.deepEqual(store.getSettings(), { model: 'my-model' });
    const record = db.prepare('SELECT * FROM compactions').get();
    assert.equal(record.first, 10);
    assert.equal(record.last, 20);
    assert.equal(record.summary, '旧模型摘要');
    assert.equal(record.tokens, 0);
    assert.deepEqual(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    db.close();
    const backups = readdirSync(directory).filter((name) => name.endsWith('.backup'));
    assert.equal(backups.length, 1);
    const backup = new DatabaseSync(join(directory, backups[0]));
    assert.equal(backup.prepare('SELECT text FROM rules').get().text, '旧规则');
    backup.close();
    openDatabase(file).close();
    assert.equal(readdirSync(directory).filter((name) => name.endsWith('.backup')).length, 1);
});


test('现有聊天库增加规则字段，保留消息且重复打开不会覆盖规则', (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'agent-chat-rules-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const file = join(directory, 'agent.db');
    const old = new DatabaseSync(file);
    old.exec(readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8').replace(/^.*rules TEXT.*\n/m, ''));
    old.exec("INSERT INTO chats (id,title,created,updated) VALUES ('a','已有对话','a','b'); INSERT INTO messages(thread,item,created) VALUES ('a','{}','a')");
    old.close();
    const db = openDatabase(file);
    const store = createStore(db);
    assert.equal(store.getThread('a').rules, '');
    assert.equal(store.listMessages('a').messages.length, 1);
    store.setRules('a', '保留这段规则');
    db.close();
    const reopened = openDatabase(file);
    assert.equal(createStore(reopened).getThread('a').rules, '保留这段规则');
    reopened.close();
});

test('提议按聊天隔离，规则原子追加、忽略无副作用、重复处理拒绝，随聊天删除', (t) => {
    const { store, db } = setup(t);
    const a = store.createThread({ title: 'A', rules: '已有规则' });
    const b = store.createThread({ title: 'B' });
    const task = store.createThread({ type: 'task', title: 'Task' });
    const payload = { kind: 'rule', summary: '建议', detail: '原因', text: '新增规则' };
    assert.throws(() => store.createProposal(task.id, payload), /只有聊天/);
    assert.throws(() => store.createProposal(a.id, { ...payload, kind: 'shell' }), /格式/);
    const proposal = store.createProposal(a.id, payload);
    assert.equal(store.listProposals(a.id).length, 1);
    assert.equal(createStore(db).listProposals(a.id)[0].text, '新增规则');
    assert.deepEqual(store.listProposals(b.id), []);
    assert.throws(() => store.answerProposal(b.id, proposal.id, 'accept'), /不存在/);
    store.answerProposal(a.id, proposal.id, 'accept');
    assert.equal(store.getThread(a.id).rules, '已有规则\n\n新增规则');
    assert.throws(() => store.answerProposal(a.id, proposal.id, 'accept'), /已处理/);
    const ignored = store.createProposal(a.id, payload);
    store.answerProposal(a.id, ignored.id, 'ignore');
    assert.equal(store.getThread(a.id).rules, '已有规则\n\n新增规则');
    const prompt = store.createProposal(a.id, { ...payload, kind: 'prompt' });
    assert.equal(store.answerProposal(a.id, prompt.id, 'accept').text, '新增规则');
    assert.deepEqual(store.getThread(a.id).context, []);
    assert.deepEqual(store.listProposals(a.id), []);
    store.deleteThread(a.id);
    assert.equal(db.prepare('SELECT count(*) AS n FROM messages').get().n, 0);
});
