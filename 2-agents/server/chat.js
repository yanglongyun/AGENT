// @ts-nocheck
// 多对话引擎。
// - 每个对话独立循环、独立 abort:Map<conversationId, controller>
// - 事件通过 emit 发布:订阅者(WS 连接)按 conversationId 过滤决定要不要推
// - sendMessage 是唯一入口:HTTP POST /api/conversations/:id/messages 与 AI curl 都调它
import { chat } from "./ai/index.js";
import { getConfig } from "./config.js";
import { buildSystemPrompt } from "./prompt.js";
import { appendMessage, saveMessages, listMessages } from "./messages.js";
import { getConversation, listConversations } from "./conversations.js";

const controllers = new Map();
const subscribers = new Set();
// 每个对话一条任务链:新消息进来时排队,不打断正在跑的循环。
// 这是多对话场景的关键——B 回投 A 时,A 可能还在跑,绝不能把自己的循环打断
// (否则会留下悬空的 assistant.tool_calls,下一轮被模型 400 拒绝)。
const queues = new Map();

const subscribe = (fn) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

const broadcast = (event) => {
  for (const fn of subscribers) {
    try { fn(event); } catch {}
  }
};

const isRunning = (conversationId) => controllers.has(Number(conversationId));

const abort = (conversationId) => {
  const cid = Number(conversationId);
  const c = controllers.get(cid);
  if (c) {
    c.abort();
    return true;
  }
  return false;
};

const handleAiEvent = (conversationId, event) => {
  const cid = Number(conversationId);
  if (event.type === "message") {
    broadcast({ type: "message", conversationId: cid, content: event.content || "" });
    return;
  }
  if (event.type === "tool_calls") {
    if (event.message) saveMessages(cid, [event.message]);
    broadcast({ type: "tool_calls", conversationId: cid, toolCalls: event.message?.tool_calls || [] });
    return;
  }
  if (event.type === "tool_results") {
    const messages = event.messages || [];
    if (messages.length) saveMessages(cid, messages);
    broadcast({
      type: "tool_results",
      conversationId: cid,
      results: messages.map((m) => ({ toolCallId: m?.tool_call_id || "", content: m?.content ?? "" })),
    });
    return;
  }
  if (event.type === "done") {
    if (event.message) saveMessages(cid, [event.message]);
    broadcast({ type: "done", conversationId: cid });
  }
};

// 实际跑一轮循环:写消息 + 拼历史 + 调模型 + 边跑边广播。
const runLoop = async (cid, { role, content }) => {
  const conversation = getConversation(cid);
  if (!conversation) throw new Error(`conversation ${cid} not found`);
  const controller = new AbortController();
  controllers.set(cid, controller);

  try {
    const config = getConfig();
    const inputMessage = { role, content };
    appendMessage(cid, inputMessage);
    broadcast({ type: "input", conversationId: cid, message: inputMessage });
    broadcast({ type: "start", conversationId: cid });

    const history = listMessages(cid).map((row) => row.message);
    const allConversations = listConversations();
    const modelMessages = [
      { role: "system", content: buildSystemPrompt({ conversation, allConversations, settings: config }) },
      ...history,
    ];

    await chat(modelMessages, {
      ...config,
      signal: controller.signal,
      onEvent: (event) => handleAiEvent(cid, event),
    });
  } catch (error) {
    if (error?.name === "AbortError") broadcast({ type: "aborted", conversationId: cid });
    else broadcast({ type: "error", conversationId: cid, content: error.message });
  } finally {
    controllers.delete(cid);
  }
};

// 对外入口:按 cid 串行化。同一对话的消息按到达顺序逐条跑,不打断对方。
const sendMessage = (conversationId, { role = "user", content } = {}) => {
  const cid = Number(conversationId);
  if (!Number.isFinite(cid)) return Promise.reject(new Error("invalid conversationId"));
  const text = String(content || "").trim();
  if (!text) return Promise.reject(new Error("content is required"));
  const validRole = role === "user" || role === "system" ? role : "user";

  const prev = queues.get(cid) || Promise.resolve();
  const next = prev.then(() => runLoop(cid, { role: validRole, content: text }), () => runLoop(cid, { role: validRole, content: text }));
  // 链上保留下个等待者的引用;catch 防止链断裂。
  queues.set(cid, next.catch(() => {}));
  return next;
};

export { sendMessage, abort, isRunning, subscribe };
