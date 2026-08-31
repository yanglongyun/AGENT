// SQLite 结构与数据访问。
// 结构变更走 ensureColumn 轻量迁移 —— 已有的本地库直接加列,不删库重开。
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(file) {
    const path = resolve(file);
    mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            workdir TEXT NOT NULL,
            pinned INTEGER NOT NULL DEFAULT 0,
            permission_mode TEXT NOT NULL DEFAULT '',
            confirm TEXT NOT NULL DEFAULT '',
            context_json TEXT NOT NULL DEFAULT '[]',
            usage_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            seq INTEGER NOT NULL,
            item_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(conversation_id, seq)
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        -- 规则:一条触发条件,命中就停下来问用户。
        -- text 是用户原话(真相),prompt 和 match_json 都是它的派生物。
        -- match_json 为 '{}' 表示编译不出条件,这条只剩提示词一个出口。
        CREATE TABLE IF NOT EXISTS rules (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            prompt TEXT NOT NULL DEFAULT '',
            match_json TEXT NOT NULL DEFAULT '{}',
            enabled INTEGER NOT NULL DEFAULT 1,
            origin TEXT NOT NULL DEFAULT 'user',
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS compactions (
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            start_seq INTEGER NOT NULL CHECK (start_seq > 0),
            end_seq INTEGER NOT NULL CHECK (end_seq >= start_seq),
            summary TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('summary', 'mechanical')),
            tokens INTEGER NOT NULL DEFAULT 0,
            at TEXT NOT NULL,
            PRIMARY KEY (conversation_id, end_seq)
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_seq
        ON messages(conversation_id, seq);
        CREATE INDEX IF NOT EXISTS idx_compactions_conversation
        ON compactions(conversation_id, end_seq);
    `);
    ensureColumn(db, 'conversations', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
    db.exec('PRAGMA optimize;');
    return db;
}

/** CREATE TABLE IF NOT EXISTS 对老库什么都不做 —— 新列在这儿补。 */
function ensureColumn(db, table, column, definition) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (columns.some((item) => item.name === column)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function createStore(db) {
    const list = db.prepare(`SELECT id, title, workdir, pinned, permission_mode, confirm, created_at, updated_at
        FROM conversations ORDER BY pinned DESC, updated_at DESC`);
    const get = db.prepare('SELECT * FROM conversations WHERE id = ?');
    const insert = db.prepare(`INSERT INTO conversations
        (id, title, workdir, context_json, created_at, updated_at) VALUES (?, ?, ?, '[]', ?, ?)`);
    const remove = db.prepare('DELETE FROM conversations WHERE id = ?');
    const pageLatest = db.prepare(`SELECT id, seq, item_json, created_at FROM messages
        WHERE conversation_id = ? ORDER BY seq DESC LIMIT ?`);
    const pageBefore = db.prepare(`SELECT id, seq, item_json, created_at FROM messages
        WHERE conversation_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?`);
    const nextSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM messages WHERE conversation_id = ?');
    const addMessage = db.prepare(`INSERT INTO messages (conversation_id, seq, item_json, created_at)
        VALUES (?, ?, ?, ?)`);
    const updateContext = db.prepare(`UPDATE conversations
        SET context_json = ?, usage_json = ?, updated_at = ? WHERE id = ?`);
    const updateTitle = db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?');
    const updatePinned = db.prepare('UPDATE conversations SET pinned = ? WHERE id = ?');
    const updateWorkdir = db.prepare('UPDATE conversations SET workdir = ? WHERE id = ?');
    const touchRow = db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?');
    const updateMode = db.prepare('UPDATE conversations SET permission_mode = ? WHERE id = ?');
    const updateConfirm = db.prepare('UPDATE conversations SET confirm = ? WHERE id = ?');
    const allRules = db.prepare('SELECT * FROM rules ORDER BY position, created_at');
    const nextPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM rules');
    const movePosition = db.prepare('UPDATE rules SET position = ? WHERE id = ?');
    const oneRule = db.prepare('SELECT * FROM rules WHERE id = ?');
    const addRule = db.prepare(`INSERT INTO rules
        (id, text, prompt, match_json, enabled, origin, created_at, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const editRule = db.prepare('UPDATE rules SET text = ?, prompt = ?, match_json = ?, enabled = ? WHERE id = ?');
    const dropRule = db.prepare('DELETE FROM rules WHERE id = ?');
    const listSettings = db.prepare('SELECT key, value FROM settings');
    const upsertSetting = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
    const latestMessageSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM messages WHERE conversation_id = ?');
    const lastCompaction = db.prepare('SELECT end_seq FROM compactions WHERE conversation_id = ? ORDER BY end_seq DESC LIMIT 1');
    const addCompaction = db.prepare(`INSERT INTO compactions
        (conversation_id, start_seq, end_seq, summary, kind, tokens, at) VALUES (?, ?, ?, ?, ?, ?, ?)`);

    const now = () => new Date().toISOString();
    const parseRule = (row) => row && ({
        id: row.id,
        text: row.text,
        prompt: row.prompt,
        match: JSON.parse(row.match_json || '{}'),
        enabled: row.enabled === 1,
        origin: row.origin,
        position: row.position,
        createdAt: row.created_at,
    });
    const parseConversation = (row) => row && ({
        ...row,
        context: JSON.parse(row.context_json || '[]'),
        usage: row.usage_json ? JSON.parse(row.usage_json) : null,
    });

    return {
        getSettings: () => Object.fromEntries(listSettings.all().map((row) => [row.key, row.value])),
        setSettings(values) {
            db.exec('BEGIN');
            try {
                for (const [key, value] of Object.entries(values)) upsertSetting.run(key, String(value ?? ''));
                db.exec('COMMIT');
            } catch (error) { db.exec('ROLLBACK'); throw error; }
            return Object.fromEntries(listSettings.all().map((row) => [row.key, row.value]));
        },
        latestMessageSeq: (id) => Number(latestMessageSeq.get(id).seq) || 0,
        lastCompactionEnd: (id) => Number(lastCompaction.get(id)?.end_seq) || 0,
        appendCompaction(id, { startSeq, endSeq, summary, kind, tokens = 0 }) {
            addCompaction.run(id, startSeq, endSeq, summary, kind, tokens, now());
        },
        listConversations: () => list.all(),
        getConversation: (id) => parseConversation(get.get(id)),
        createConversation({ id, title, workdir }) {
            const at = now();
            insert.run(id, title, workdir, at, at);
            return parseConversation(get.get(id));
        },
        deleteConversation: (id) => remove.run(id).changes > 0,

        /** 最近一页(按 seq 升序返回);before 传上一页最早的 seq 往前翻。 */
        listMessages(id, { before = 0, limit = 60 } = {}) {
            const rows = before > 0 ? pageBefore.all(id, before, limit + 1) : pageLatest.all(id, limit + 1);
            const hasMore = rows.length > limit;
            const page = rows.slice(0, limit).reverse();
            return {
                messages: page.map((row) => ({ seq: row.seq, item: JSON.parse(row.item_json), createdAt: row.created_at })),
                hasMore,
            };
        },

        append(id, item) {
            const seq = Number(nextSeq.get(id).seq);
            const at = now();
            addMessage.run(id, seq, JSON.stringify(item), at);
            touchRow.run(at, id);
            return { seq, item, createdAt: at };
        },
        saveContext(id, context, usage) {
            updateContext.run(JSON.stringify(context), usage ? JSON.stringify(usage) : null, now(), id);
        },
        setTitle(id, title) { updateTitle.run(title, now(), id); },
        /** 置顶不动 updated_at —— 置顶完还按最后活动排,别让它跳到最近组顶上。 */
        setPinned(id, pinned) { updatePinned.run(pinned ? 1 : 0, id); },
        setWorkdir(id, workdir) { updateWorkdir.run(workdir, id); },
        setPermissionMode(id, mode) { updateMode.run(String(mode || ''), id); },
        setConfirm(id, value) { updateConfirm.run(String(value || ''), id); },

        // ---- 规则 ----
        listRules: () => allRules.all().map(parseRule),
        getRule: (id) => parseRule(oneRule.get(id)),
        createRule(rule) {
            addRule.run(rule.id, rule.text, rule.prompt, JSON.stringify(rule.match || {}),
                rule.enabled ? 1 : 0, rule.origin || 'user', now(), Number(nextPosition.get().position));
            return parseRule(oneRule.get(rule.id));
        },
        /** 按给定的 id 次序重排。没提到的行不动 —— 只重写这一批的位次。 */
        reorderRules(ids = []) {
            db.exec('BEGIN');
            try {
                ids.forEach((id, index) => movePosition.run(index + 1, String(id)));
                db.exec('COMMIT');
            } catch (error) { db.exec('ROLLBACK'); throw error; }
            return true;
        },
        updateRule(id, values) {
            const current = parseRule(oneRule.get(id));
            if (!current) return null;
            const next = { ...current, ...values };
            editRule.run(next.text, next.prompt, JSON.stringify(next.match || {}), next.enabled ? 1 : 0, id);
            return parseRule(oneRule.get(id));
        },
        deleteRule: (id) => dropRule.run(id).changes > 0,
    };
}
