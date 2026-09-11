-- 时间均由应用写入 UTC ISO 字符串；JSON 内容使用 TEXT 存储。
CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY NOT NULL, -- 全局唯一的聊天 ID
    title TEXT NOT NULL, -- 标题
    rules TEXT NOT NULL DEFAULT '', -- 本对话规则，整段文本
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)), -- 是否置顶
    context TEXT NOT NULL DEFAULT '[]', -- 当前模型上下文
    usage TEXT, -- 最近一次模型用量
    created TEXT NOT NULL, -- 创建时间
    updated TEXT NOT NULL -- 最近活动时间
);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY NOT NULL, -- 全局唯一的任务 ID，与聊天 ID 不重复
    title TEXT NOT NULL, -- 标题
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')), -- 任务状态
    context TEXT NOT NULL DEFAULT '[]', -- 当前模型上下文
    usage TEXT, -- 最近一次模型用量
    created TEXT NOT NULL, -- 创建时间
    updated TEXT NOT NULL, -- 最近活动时间
    finished TEXT -- 完成、失败或取消时间
);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 全局递增消息 ID，也用于排序和翻页
    thread TEXT NOT NULL, -- 所属聊天或任务 ID，由应用事务校验归属
    item TEXT NOT NULL, -- 完整 Responses 消息项，JSON
    created TEXT NOT NULL -- 写入时间
);
CREATE TABLE IF NOT EXISTS compactions (
    thread TEXT NOT NULL, -- 所属聊天或任务 ID
    first INTEGER NOT NULL CHECK (first > 0), -- 覆盖的起始消息 ID，含端点
    last INTEGER NOT NULL CHECK (last >= first), -- 覆盖的结束消息 ID，含端点
    summary TEXT NOT NULL, -- 模型生成的摘要
    tokens INTEGER NOT NULL DEFAULT 0 CHECK (tokens >= 0), -- 摘要输出 token 数，0 表示未记录
    created TEXT NOT NULL, -- 摘要写入时间
    PRIMARY KEY (thread, last)
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL, -- 设置名称
    value TEXT NOT NULL -- 设置值
);
CREATE INDEX IF NOT EXISTS chatslist ON chats (pinned DESC, updated DESC);
CREATE INDEX IF NOT EXISTS taskslist ON tasks (updated DESC);
CREATE INDEX IF NOT EXISTS tasksstatus ON tasks (status, updated DESC);
CREATE INDEX IF NOT EXISTS messagesthread ON messages (thread, id);
