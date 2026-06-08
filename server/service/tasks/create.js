// @ts-nocheck
import { chat } from "../../ai/index.js";
import { buildSystemPrompt } from "../chat/prompt.js";
import { getChatRunConfig } from "../chat/config.js";
import {
  createTaskRow,
  markTaskDone,
  markTaskError,
  markTaskRunning,
  markTaskAborted,
} from "../../repository/tasks/index.js";
import { createSubscription, fireTaskSubscriptions } from "../subscriptions/index.js";
import { registerTaskExecution, unregisterTaskExecution } from "./execution.js";
import { appendChatMessage, createChat, getChat, saveChatMessages, setChatState } from "../chat/index.js";

const sanitizeTaskName = (value) => {
  const name = String(value || "").trim();
  if (!name) throw new Error("task name is required");
  return name.slice(0, 120);
};

const readTaskPrompt = (detail, messages) => {
  if (Array.isArray(messages) && messages.length) {
    const user = messages.find((item) => item?.role === "user" && item.content);
    if (user) return String(user.content || "").trim();
  }
  return String(detail || "").trim();
};

const getLastAssistantText = (result = {}) => {
  const messages = Array.isArray(result.messages) ? result.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === "assistant" && msg.content) return String(msg.content);
  }
  return String(result.text || "");
};

const getTaskChatId = (taskId) => `task:${taskId}`;

const ensureTaskChat = ({ taskId, name }) => {
  const chatId = getTaskChatId(taskId);
  if (!getChat(chatId)) {
    createChat({
      chatId,
      title: name,
      app: "task",
      meta: { taskId },
    });
  }
  return chatId;
};

const saveTaskAiEvent = ({ chatId, event }) => {
  if (event.type === "tool_calls" && event.message) {
    saveChatMessages({ chatId, source: "task", messages: [event.message] });
    return;
  }
  if (event.type === "tool_results") {
    const messages = event.messages || [];
    if (messages.length) saveChatMessages({ chatId, source: "task", messages });
    return;
  }
  if (event.type === "done" && event.message) {
    saveChatMessages({
      chatId,
      source: "task",
      messages: [event.message],
      usage: event.usage || null,
    });
  }
};

const runTaskAi = async ({ taskId, taskChatId, name, prompt, inputOverrides, signal }) => {
  const settings = getChatRunConfig(inputOverrides || {});
  const systemMessage = {
    role: "system",
    content: [
      buildSystemPrompt("", [], settings),
      "",
      "## Background Task",
      "- You are running in a background task, not the foreground chat.",
      "- Finish the task and return a concise final result.",
      "- Use shell only when useful.",
      `- Task id: ${taskId}`,
      `- Task name: ${name}`,
    ].join("\n"),
  };
  const result = await chat([
    systemMessage,
    { role: "user", content: prompt },
  ], {
    ...settings,
    signal,
    onEvent: (event) => saveTaskAiEvent({ chatId: taskChatId, event }),
  });
  return getLastAssistantText(result);
};

const createTask = ({ taskName, name, detail, prompt, messages, inputOverrides = {}, subscription = null } = {}) => {
  const taskNameValue = sanitizeTaskName(taskName || name);
  const taskPrompt = readTaskPrompt(prompt || detail, messages);
  if (!taskPrompt) throw new Error("task prompt is required");
  const taskId = createTaskRow({ name: taskNameValue, prompt: taskPrompt });
  const taskChatId = ensureTaskChat({ taskId, name: taskNameValue });
  appendChatMessage({
    chatId: taskChatId,
    message: { role: "user", content: taskPrompt },
    meta: { source: "task" },
  });
  const subscriptionId = subscription?.chatId
    ? createSubscription({ taskId, chatId: subscription.chatId })
    : null;

  const controller = new AbortController();
  registerTaskExecution(taskId, controller);
  markTaskRunning(taskId);
  setChatState({ chatId: taskChatId, state: "running" });

  const run = async () => {
    try {
      const response = await runTaskAi({
        taskId,
        taskChatId,
        name: taskNameValue,
        prompt: taskPrompt,
        inputOverrides,
        signal: controller.signal,
      });
      markTaskDone(taskId, response);
      await fireTaskSubscriptions({ taskId, taskName: taskNameValue, status: "done", response });
    } catch (error) {
      if (error?.name === "AbortError") {
        markTaskAborted(taskId);
        await fireTaskSubscriptions({ taskId, taskName: taskNameValue, status: "aborted" });
      } else {
        markTaskError(taskId, error.message);
        await fireTaskSubscriptions({ taskId, taskName: taskNameValue, status: "error", error: error.message });
      }
    } finally {
      setChatState({ chatId: taskChatId, state: "idle" });
      unregisterTaskExecution(taskId);
    }
  };

  void run();
  return { taskId, taskName: taskNameValue, taskChatId, subscriptionId };
};

export { createTask, getTaskChatId };
