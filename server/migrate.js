// 仅用于从旧 conversations 结构迁移；迁移成功后旧表全部移除。
export function migrate(db, schema, file) {
    const legacy = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'conversations'").get();
    if (!legacy) {
        db.exec(schema);
        if (!db.prepare('PRAGMA table_info(chats)').all().some((column) => column.name === 'rules')) {
            db.exec("ALTER TABLE chats ADD COLUMN rules TEXT NOT NULL DEFAULT ''");
        }
        return;
    }
    // SQLite 自己生成一致性快照，包含尚在 WAL 中的数据。
    const backup = `${file}.${Date.now()}.backup`;
    db.prepare('VACUUM INTO ?').run(backup);
    db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE');
    try {
        db.exec(`
            ALTER TABLE messages RENAME TO oldmessages;
            ALTER TABLE compactions RENAME TO oldcompactions;
        `);
        db.exec(schema);
        db.exec(`
            INSERT INTO chats (id, title, pinned, context, usage, created, updated)
            SELECT id, title, pinned, context_json, usage_json, created_at, updated_at FROM conversations;
            INSERT INTO messages (id, thread, item, created)
            SELECT id, conversation_id, item_json, created_at FROM oldmessages ORDER BY id;
        `);
        // 旧 seq 是每个聊天的序号，必须按归属查真实 ID，不能把 seq 当全局 ID。
        const records = db.prepare('SELECT * FROM oldcompactions ORDER BY conversation_id, end_seq').all();
        const range = db.prepare(`SELECT MIN(id) AS first, MAX(id) AS last FROM oldmessages
            WHERE conversation_id = ? AND seq BETWEEN ? AND ?`);
        const insert = db.prepare('INSERT INTO compactions (thread, first, last, summary, tokens, created) VALUES (?, ?, ?, ?, ?, ?)');
        for (const row of records) {
            // 历史机械裁剪不冒充模型摘要；其原文仍保留在 messages 和迁移备份中。
            if (row.kind !== 'summary') continue;
            const bounds = range.get(row.conversation_id, row.start_seq, row.end_seq);
            if (bounds.first === null) throw new Error('旧压缩记录找不到消息范围，迁移已取消');
            // 旧 tokens 是请求总消耗，不能当摘要输出 token 数使用。
            insert.run(row.conversation_id, bounds.first, bounds.last, row.summary, 0, row.at);
        }
        db.exec(`
            DROP TABLE IF EXISTS proposals;
            DROP TABLE IF EXISTS rules;
            DROP TABLE oldcompactions;
            UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'oldmessages'), 0)) WHERE name = 'messages';
            DROP TABLE oldmessages;
            DROP TABLE conversations;
            DELETE FROM settings WHERE key IN ('rulesEnabled', 'rulesSeeded', 'workdir', 'defaultWorkdir');
            COMMIT;
        `);
        console.log(`[database] 迁移完成，原库备份：${backup}`);
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    } finally { db.exec('PRAGMA foreign_keys = ON'); }
}
