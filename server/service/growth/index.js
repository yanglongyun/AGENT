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

const buildGrowthPrompt = ({ chatId, transcript }) => `You are running a silent growth task for Agent Chat.

This task is asynchronous and has no subscription. Do not report back to the foreground chat.

Your job:
1. Review the recent chat transcript.
2. Decide whether anything durable should be improved.
3. If useful, update memories.
4. If useful, create or update local skills.
5. If you changed anything meaningful, add one update record.

Rules:
- Be conservative. Do nothing if the transcript does not contain durable user preference, reusable workflow, or skill-worthy knowledge.
- Memories are user context. Use shell with the existing memories HTTP API:
  - Search: GET http://127.0.0.1:9500/api/memories/search?q=QUERY
  - Read: GET http://127.0.0.1:9500/api/memories/get?id=ID
  - Create: POST http://127.0.0.1:9500/api/memories
  - Update: PATCH http://127.0.0.1:9500/api/memories?id=ID
- Skills are files, not API writes. Create/update skills with shell at skills/<skill-id>/SKILL.md.
- Skill files must use frontmatter with name and description, then clear instructions.
- After a meaningful memory or skill change, record it with:
  POST http://127.0.0.1:9500/api/updates
  JSON body: {"title":"short title","description":"short description"}
- Do not add LLM tools.
- Do not create tasks.
- Do not modify unrelated files.

Chat id: ${chatId}

Recent transcript:
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
