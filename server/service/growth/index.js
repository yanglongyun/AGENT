// @ts-nocheck
import { createTask } from "../tasks/index.js";
import { getChat, listChatMessages } from "../chat/index.js";

const readMessageText = (message = {}) => {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
    return message.tool_calls
      .map((call) => `${call?.function?.name || "tool"} ${call?.function?.arguments || "{}"}`)
      .join("\n");
  }
  if (message.content != null) return JSON.stringify(message.content);
  return JSON.stringify(message);
};

const buildTranscript = (rows = []) =>
  rows
    .map((row) => {
      const role = row?.message?.role || "unknown";
      const source = row?.meta?.source ? `/${row.meta.source}` : "";
      return `[${row.id}] ${role}${source}: ${readMessageText(row.message)}`;
    })
    .join("\n\n");

const buildGrowthPrompt = ({ chatId, transcript }) => `你正在为 Agent Chat 运行一个静默成长任务。

这是一个异步任务，没有订阅回传。不要向前台聊天汇报。

你的任务：
1. 回顾最近的聊天记录。
2. 判断是否有值得长期保留或改进的内容。
3. 如有帮助，更新记忆。
4. 如有帮助，创建或更新本地技能。
5. 如果做了有意义的记忆或技能变更，新增一条更新记录。

规则：
- 保守处理。如果记录中没有长期用户偏好、可复用流程或值得沉淀为技能的知识，就不要做任何事。
- 记忆是用户上下文。使用 shell 通过现有记忆 HTTP API 操作：
  - 搜索：GET http://127.0.0.1:9500/api/memories/search?q=QUERY
  - 读取：GET http://127.0.0.1:9500/api/memories/get?id=ID
  - 创建：POST http://127.0.0.1:9500/api/memories
  - 更新：PATCH http://127.0.0.1:9500/api/memories?id=ID
- 技能是文件，不是 API 写入。使用 shell 在 skills/<skill-id>/SKILL.md 创建或更新技能。
- 技能文件必须包含 name 和 description 的 frontmatter，然后写清楚说明。
- 完成有意义的记忆或技能变更后，用下面接口记录：
  POST http://127.0.0.1:9500/api/updates
  JSON body: {"title":"简短标题","description":"简短描述"}
- 不要增加 LLM 工具。
- 不要创建任务。
- 不要修改无关文件。

聊天 id：${chatId}

最近记录：
${transcript}`;

const shouldEnqueueGrowth = ({ chatId, input = {}, result = null } = {}) => {
  const source = String(input.source || "").trim();
  if (source) return false;
  if (!result) return false;
  const chat = getChat(chatId);
  return chat?.app === "chat";
};

const enqueueGrowthTask = ({ chatId, input = {}, result = null } = {}) => {
  if (!shouldEnqueueGrowth({ chatId, input, result })) return null;
  const rows = listChatMessages({ chatId, limit: 24, recent: true }).messages;
  const transcript = buildTranscript(rows);
  if (!transcript.trim()) return null;
  return createTask({
    name: `Growth: ${chatId}`,
    prompt: buildGrowthPrompt({ chatId, transcript }),
    inputOverrides: input.config || input,
    subscription: null,
  });
};

export { enqueueGrowthTask };
