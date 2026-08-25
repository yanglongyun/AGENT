# 0.0.6 — 可追踪的上下文压缩

这一版为 Web 和 Desktop 的 SQLite 同时增加 `compactions` 表。原始消息、压缩记录和当前运行缓存从此各自承担单一职责。

## 数据职责

```text
messages                    完整、不可变的原始事件
compactions                 只追加的压缩记录与覆盖区间
conversations.context_json  下一轮运行使用的上下文缓存
conversations.usage_json    最近一次模型用量
```

压缩不会删除或改写 `messages`。`context_json` 仍用于快速启动下一轮，但不再是压缩历史的唯一保存位置。

## DDL

```sql
CREATE TABLE IF NOT EXISTS compactions (
    conversation_id TEXT NOT NULL
        REFERENCES conversations(id) ON DELETE CASCADE,
    start_seq INTEGER NOT NULL CHECK (start_seq > 0),
    end_seq INTEGER NOT NULL CHECK (end_seq >= start_seq),
    summary TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('summary', 'mechanical')),
    tokens INTEGER NOT NULL DEFAULT 0,
    at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, end_seq)
);

CREATE INDEX IF NOT EXISTS idx_compactions_conversation
ON compactions(conversation_id, end_seq);
```

## 写入规则

- 只有真正发生压缩时才新增记录。
- 每条记录覆盖 `(上一条 end_seq, 当前 end_seq]` 对应的新区间。
- `summary` 保存本次用于上下文的摘要正文。
- `kind=summary` 表示模型摘要；模型失败或摘要不可用时记录为 `mechanical`。
- `tokens` 记录本次压缩尝试消耗的输入与输出 Token 总和；未产生模型请求时为 `0`。
- 删除对话时由外键级联删除对应压缩记录。

Web 与 Desktop 使用完全一致的 DDL 和写入逻辑，仅数据库文件位置不同。旧数据库启动时会自动创建新表，不需要删库或手工迁移。
