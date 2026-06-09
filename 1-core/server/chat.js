// @ts-nocheck
// 单对话的发送循环:读历史 -> 追加 user -> 跑工具调用循环 -> 边跑边存边推流。
import { chat } from "./ai/index.js";
import { getConfig } from "./config.js";
import { buildSystemPrompt } from "./prompt.js";
import { appendMessage, saveMessages, listMessages } from "./messages.js";

// 单对话:全局只有一个进行中的 controller。
let controller = null;

const isRunning = () => !!controller;

const abort = () => {
  if (controller) {
    controller.abort();
    return true;
  }
  return false;
};

// 把每一步 AI 事件:存库 + 推给前端。
const handleAiEvent = (event, emit) => {
  if (event.type === "message") {
    emit({ type: "message", content: event.content || "" });
    return;
  }
  if (event.type === "tool_calls") {
    if (event.message) saveMessages([event.message]);
    emit({ type: "tool_calls", toolCalls: event.message?.tool_calls || [] });
    return;
  }
  if (event.type === "tool_results") {
    const messages = event.messages || [];
    if (messages.length) saveMessages(messages);
    emit({
      type: "tool_results",
      results: messages.map((m) => ({ toolCallId: m?.tool_call_id || "", content: m?.content ?? "" })),
    });
    return;
  }
  if (event.type === "done") {
    if (event.message) saveMessages([event.message]);
    emit({ type: "done" });
  }
};

const sendMessage = async (prompt, emit = () => {}) => {
  const text = String(prompt || "").trim();
  if (!text) return;
  if (controller) {
    abort();
    while (controller) await new Promise((r) => setTimeout(r, 30));
  }

  controller = new AbortController();
  const signal = controller.signal;

  try {
    const config = getConfig();
    const userMessage = { role: "user", content: text };
    appendMessage(userMessage);
    emit({ type: "input", message: userMessage });
    emit({ type: "start" });

    const history = listMessages().map((row) => row.message);
    const modelMessages = [
      { role: "system", content: buildSystemPrompt(config) },
      ...history,
    ];

    await chat(modelMessages, {
      ...config,
      signal,
      onEvent: (event) => handleAiEvent(event, emit),
    });
  } catch (error) {
    if (error?.name === "AbortError") emit({ type: "aborted" });
    else emit({ type: "error", content: error.message });
  } finally {
    controller = null;
  }
};

export { sendMessage, abort, isRunning };
