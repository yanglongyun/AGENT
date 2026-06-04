// @ts-nocheck
// 任务回调:任务进入终态时,把结果回灌到 notify 会话并唤醒它。
// 这是原 monitor 回灌层折叠进任务后的内在能力,单目标、无扇出。
import { appendMessage } from "../../repository/messages/index.js";
import { broadcast, broadcastAll, wakeConversation } from "../../runtime/realtime.js";

const EVENT_LABELS = {
  done: "任务已完成",
  error: "任务失败",
  aborted: "任务已中止",
};

const buildNoticeMessage = ({ taskId, name, event, payload, notifyPrompt }) => {
  const lines = [
    "[TASK]",
    `任务:${name || `#${taskId}`}`,
    `事件:${EVENT_LABELS[event] || event}`,
  ];
  if (notifyPrompt) {
    lines.push("", "指令:", notifyPrompt);
  }
  const body = payload == null ? "" : typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  if (body) {
    lines.push("", "结果:", body);
  }
  lines.push("[END]");
  return lines.join("\n");
};

// task: { id, name, notify_conversation_id, notify_prompt }
const notifyTaskFinished = (task, { event, payload }) => {
  const conversationId = String(task?.notify_conversation_id || "").trim();
  if (!conversationId) return;

  const message = {
    role: "user",
    content: buildNoticeMessage({
      taskId: task.id,
      name: task.name,
      event,
      payload,
      notifyPrompt: task.notify_prompt,
    }),
    meta: { source: "task", synthetic: true, taskId: task.id, event },
  };

  try {
    appendMessage(conversationId, message);
    broadcast(conversationId, { type: "chat.message", ok: true, message });
    broadcastAll({ type: "tasks_changed" });
    // 唤醒 notify 会话的 AI 接着处理(非阻塞)
    wakeConversation(conversationId).catch(() => {});
  } catch (error) {
    console.error(`notifyTaskFinished failed for task ${task?.id}: ${error.message}`);
  }
};

export { notifyTaskFinished };
