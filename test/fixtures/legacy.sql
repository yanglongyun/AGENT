
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            workdir TEXT NOT NULL,
            pinned INTEGER NOT NULL DEFAULT 0,
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
        -- 规则:用户的一句话,原样进系统提示词。一张全局的单子,没有派生物。
        CREATE TABLE IF NOT EXISTS rules (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        -- 提议:模型放到用户面前的可选项,点了才生效。不设超时,它不卡任何东西。
        CREATE TABLE IF NOT EXISTS proposals (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            kind TEXT NOT NULL CHECK (kind IN ('rule', 'prompt')),
            text TEXT NOT NULL,
            replaces TEXT NOT NULL DEFAULT '',
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
