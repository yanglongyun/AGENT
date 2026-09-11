// 五张业务表；聊天和任务通过全局唯一的 ID 共用消息及压缩记录。
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { replaceText } from '../agent/functions/edit.js';
import { migrate } from './migrate.js';

export function openDatabase(file) {
    const path = file === ':memory:' ? file : resolve(file);
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    try {
        db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
        migrate(db, readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'), path);
        db.exec('PRAGMA optimize;');
        return db;
    } catch (error) { db.close(); throw error; }
}

export function createStore(db) {
    const now = () => new Date().toISOString();
    function transaction(fn) {
        db.exec('BEGIN IMMEDIATE');
        try { const result = fn(); db.exec('COMMIT'); return result; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    const tables = ['chats', 'tasks'];
    const statements = Object.fromEntries(tables.map((table) => [table, {
        get: db.prepare(`SELECT * FROM ${table} WHERE id = ?`),
        insert: db.prepare(`INSERT INTO ${table} (id, title, created, updated) VALUES (?, ?, ?, ?)`),
        remove: db.prepare(`DELETE FROM ${table} WHERE id = ?`),
        context: db.prepare(`UPDATE ${table} SET context = ?, usage = ?, updated = ? WHERE id = ?`),
        usage: db.prepare(`UPDATE ${table} SET usage = ? WHERE id = ?`),
        title: db.prepare(`UPDATE ${table} SET title = ?, updated = ? WHERE id = ?`),
        touch: db.prepare(`UPDATE ${table} SET updated = ? WHERE id = ?`),
    }]));
    const parse = (row, type) => row && ({ ...row, type, context: JSON.parse(row.context), usage: row.usage ? JSON.parse(row.usage) : null });
    function owner(id) {
        for (const table of tables) if (statements[table].get.get(id)) return table;
        throw Object.assign(new Error('聊天或任务不存在'), { status: 404 });
    }
    function getThread(id) {
        for (const table of tables) {
            const row = statements[table].get.get(id);
            if (row) return parse(row, table === 'chats' ? 'chat' : 'task');
        }
        return null;
    }
    const addMessage = db.prepare('INSERT INTO messages (thread, item, created) VALUES (?, ?, ?)');
    function append(id, item) {
        const table = owner(id);
        const created = now();
        const result = addMessage.run(id, JSON.stringify(item), created);
        statements[table].touch.run(created, id);
        return { id: Number(result.lastInsertRowid), thread: id, item, created };
    }
    function saveContext(id, context, usage) {
        statements[owner(id)].context.run(JSON.stringify(context), usage ? JSON.stringify(usage) : null, now(), id);
    }
    const latest = db.prepare('SELECT * FROM messages WHERE thread = ? ORDER BY id DESC LIMIT ?');
    const beforeMessage = db.prepare('SELECT * FROM messages WHERE thread = ? AND id < ? ORDER BY id DESC LIMIT ?');
    const lastCompaction = db.prepare('SELECT last FROM compactions WHERE thread = ? ORDER BY last DESC LIMIT 1');
    const boundary = db.prepare(`SELECT id FROM messages WHERE thread = ?
        AND json_extract(item, '$.kind') IS NOT 'compaction' AND json_extract(item, '$.kind') IS NOT 'proposal' ORDER BY id DESC LIMIT 1 OFFSET ?`);
    const firstMessage = db.prepare(`SELECT MIN(id) AS id FROM messages WHERE thread = ? AND id > ? AND id <= ?
        AND json_extract(item, '$.kind') IS NOT 'compaction' AND json_extract(item, '$.kind') IS NOT 'proposal'`);
    const addCompaction = db.prepare('INSERT INTO compactions (thread, first, last, summary, tokens, created) VALUES (?, ?, ?, ?, ?, ?)');
    const statusUpdate = db.prepare('UPDATE tasks SET status = ?, finished = ?, updated = ? WHERE id = ?');

    function applyRuleEdit(current, proposal) {
        // 旧版待处理追加提议仍按原先展示的含义处理。
        if (proposal.old_text === undefined) return [current, proposal.text].filter(Boolean).join('\n\n');
        let next;
        if (proposal.old_text === '') {
            if (current !== '') throw Object.assign(new Error('规则已变化：空原文只能用于创建空白规则，请重新提议'), { status: 409 });
            next = proposal.new_text;
        } else {
            try { next = replaceText(current, proposal.old_text, proposal.new_text, proposal.replace_all).text; }
            catch (error) { throw Object.assign(new Error(`规则编辑冲突：${error.message}，请重新提议`), { status: 409 }); }
        }
        if (next === current) throw Object.assign(new Error('提议没有实际修改'), { status: 400 });
        if (next.length > 20000) throw Object.assign(new Error('修改后规则超过 20000 字'), { status: 400 });
        return next;
    }

    return {
        getThread,
        createProposal(id, payload) {
            if (owner(id) !== 'chats') throw Object.assign(new Error('只有聊天支持提议'), { status: 400 });
            if (!['rule', 'prompt'].includes(payload.kind) || ['summary', 'detail'].some((key) => typeof payload[key] !== 'string') || !payload.summary.trim() || payload.summary.length > 200 || payload.detail.length > 20000) throw Object.assign(new Error('提议格式无效或文本过长'), { status: 400 });
            let change;
            if (payload.kind === 'rule') {
                if (['old_text', 'new_text'].some((key) => typeof payload[key] !== 'string' || payload[key].length > 20000) || (payload.replace_all !== undefined && typeof payload.replace_all !== 'boolean')) throw Object.assign(new Error('规则提议必须提供 old_text 和 new_text'), { status: 400 });
                change = { old_text: payload.old_text, new_text: payload.new_text, replace_all: payload.replace_all === true };
                applyRuleEdit(getThread(id).rules, change);
            } else {
                if (typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 20000) throw Object.assign(new Error('问题提议必须提供 text'), { status: 400 });
                change = { text: payload.text };
            }
            const saved = transaction(() => append(id, { kind: 'proposal', proposal: { kind: payload.kind, summary: payload.summary, detail: payload.detail, ...change, status: 'pending' } }));
            return { id: saved.id, thread: id, ...saved.item.proposal };
        },
        listProposals(id) {
            owner(id);
            return db.prepare("SELECT id,item FROM messages WHERE thread = ? AND json_extract(item, '$.kind') = 'proposal' AND json_extract(item, '$.proposal.status') = 'pending' ORDER BY id").all(id).map((row) => ({ id: row.id, thread: id, ...JSON.parse(row.item).proposal }));
        },
        answerProposal(thread, id, answer) {
            if (!['accept', 'ignore'].includes(answer)) throw Object.assign(new Error('无效答复'), { status: 400 });
            return transaction(() => {
                owner(thread);
                const row = db.prepare("SELECT item FROM messages WHERE id = ? AND thread = ? AND json_extract(item, '$.kind') = 'proposal'").get(id, thread);
                if (!row) throw Object.assign(new Error('提议不存在'), { status: 404 });
                const item = JSON.parse(row.item), proposal = item.proposal;
                if (proposal.status !== 'pending') throw Object.assign(new Error('提议已处理'), { status: 409 });
                if (answer === 'accept' && proposal.kind === 'rule') {
                    const rules = applyRuleEdit(getThread(thread).rules, proposal);
                    if (rules.length > 20000) throw Object.assign(new Error('修改后规则超过 20000 字，请先整理本对话规则'), { status: 400 });
                    db.prepare('UPDATE chats SET rules = ?, updated = ? WHERE id = ?').run(rules, now(), thread);
                }
                proposal.status = answer === 'accept' ? 'accepted' : 'ignored';
                db.prepare('UPDATE messages SET item = ? WHERE id = ?').run(JSON.stringify(item), id);
                return { id, thread, ...proposal };
            });
        },
        setRules(id, rules) {
            if (owner(id) !== 'chats') throw Object.assign(new Error('只有聊天支持规则'), { status: 400 });
            if (typeof rules !== 'string' || rules.length > 20000) throw Object.assign(new Error('规则必须是文本，最多 20000 字'), { status: 400 });
            db.prepare('UPDATE chats SET rules = ?, updated = ? WHERE id = ?').run(rules, now(), id);
        },
        listChats: () => db.prepare('SELECT id, title, pinned, created, updated FROM chats ORDER BY pinned DESC, updated DESC').all(),
        listTasks: () => db.prepare('SELECT id, title, status, created, updated, finished FROM tasks ORDER BY updated DESC').all(),
        createThread({ type = 'chat', id = `${type}_${crypto.randomUUID()}`, title, rules = '' }) {
            if (!['chat', 'task'].includes(type)) throw new Error('未知 thread 类型');
            return transaction(() => {
                if (getThread(id)) throw Object.assign(new Error('ID 已存在'), { status: 409 });
                const at = now();
                statements[type === 'chat' ? 'chats' : 'tasks'].insert.run(id, title, at, at);
                if (type === 'chat') db.prepare('UPDATE chats SET rules = ? WHERE id = ?').run(rules, id);
                return getThread(id);
            });
        },
        deleteThread(id) {
            return transaction(() => {
                const table = owner(id);
                db.prepare('DELETE FROM messages WHERE thread = ?').run(id);
                db.prepare('DELETE FROM compactions WHERE thread = ?').run(id);
                return statements[table].remove.run(id).changes > 0;
            });
        },
        listMessages(id, { before = 0, limit = 60 } = {}) {
            owner(id);
            const rows = before > 0 ? beforeMessage.all(id, before, limit + 1) : latest.all(id, limit + 1);
            return { messages: rows.slice(0, limit).reverse().map((row) => ({ ...row, item: JSON.parse(row.item) })), hasMore: rows.length > limit };
        },
        append: (id, item) => transaction(() => append(id, item)),
        saveContext,
        // 消息与当前上下文一起提交；服务异常退出后仍可继续。
        record(id, item, context, usage) {
            return transaction(() => { const saved = append(id, item); saveContext(id, context, usage); return saved; });
        },
        saveUsage(id, usage) { statements[owner(id)].usage.run(JSON.stringify(usage), id); },
        setTitle(id, title) { statements[owner(id)].title.run(title, now(), id); },
        setPinned(id, pinned) {
            if (owner(id) !== 'chats') throw Object.assign(new Error('只有聊天支持置顶'), { status: 400 });
            db.prepare('UPDATE chats SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
        },
        setStatus(id, status) {
            if (owner(id) !== 'tasks') throw Object.assign(new Error('只有任务有状态'), { status: 400 });
            if (!['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'].includes(status)) {
                throw Object.assign(new Error('无效任务状态'), { status: 400 });
            }
            const at = now();
            statusUpdate.run(status, ['completed', 'failed', 'cancelled'].includes(status) ? at : null, at, id);
        },
        compact(id, { tailCount, summary, tokens, history, usage }) {
            return transaction(() => {
                owner(id);
                // 消息 ID 可被其他 thread 打断；按本 thread 排序取边界，不做 ID 减法。
                const last = boundary.get(id, tailCount)?.id;
                const previous = lastCompaction.get(id)?.last || 0;
                const first = last ? firstMessage.get(id, previous, last)?.id : null;
                if (!first) throw new Error('摘要覆盖范围无效');
                addCompaction.run(id, first, last, summary, tokens, now());
                append(id, history[0]);
                saveContext(id, history, usage);
            });
        },
        getSettings: () => Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((row) => [row.key, row.value])),
        setSettings(values) {
            return transaction(() => {
                const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
                for (const [key, value] of Object.entries(values)) upsert.run(key, String(value ?? ''));
                return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((row) => [row.key, row.value]));
            });
        },
    };
}
