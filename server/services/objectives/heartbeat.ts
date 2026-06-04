// @ts-nocheck
// 心跳驱动器:把被动内核变成自主体的那把钥匙。
// 按 heartbeat_seconds 周期向目标会话注入一条心跳消息并唤醒 AI,
// 和任务回调共用同一个唤醒出口 wakeConversation(区别只在触发源:时间 vs 事件)。
import { appendMessage, listMessages } from "../../repository/messages/index.js";
import {
  recordObjectiveBeat,
  recordObjectiveError,
  setObjectiveStatus,
} from "../../repository/objectives/index.js";
import {
  broadcast,
  broadcastAll,
  isChatRunning,
  wakeConversation,
} from "../../runtime/realtime.js";
import { getObjective, listObjectives } from "./get.js";

// objectiveId -> intervalId
const timers = new Map();

const DONE_TAG = /<objective-done>([\s\S]*?)<\/objective-done>/i;

const buildHeartbeatMessage = (objective, beatNumber) =>
  [
    `[HEARTBEAT #${beatNumber}]`,
    `目标:${objective.objective}`,
    "",
    "这是一次自主运营心跳。请按以下步骤推进:",
    "1. 回顾目标与当前进展(必要时用 shell 查历史 / 状态)。",
    "2. 决定并执行朝目标推进的下一步,用工具实际去做。",
    "3. 简要记录本轮做了什么、产出了什么可度量的进展。",
    "4. 若本轮无法推进,说明卡在哪、下一轮打算怎么办。",
    "5. 目标已完全达成时,输出 <objective-done>简述达成情况</objective-done>,心跳将自动停止。",
    "[END]",
  ].join("\n");

const lastAssistantDeclaredDone = (conversationId) => {
  const { messages } = listMessages(conversationId, 1, 8, "desc");
  for (const message of messages) {
    if (message.role === "assistant") {
      return DONE_TAG.test(String(message.content || ""));
    }
  }
  return false;
};

const beat = async (objectiveId) => {
  const objective = getObjective(objectiveId);
  if (!objective || objective.status !== "running") {
    stopHeartbeat(objectiveId);
    return;
  }
  // 上一轮还在跑就跳过这一拍,靠 runningChats 互斥避免重入
  if (isChatRunning(objective.conversationId)) return;

  const message = {
    role: "user",
    content: buildHeartbeatMessage(objective, objective.beats + 1),
    meta: { source: "heartbeat", synthetic: true, objectiveId: objective.id },
  };

  appendMessage(objective.conversationId, message);
  recordObjectiveBeat(objective.id);
  broadcast(objective.conversationId, { type: "chat.message", ok: true, message });
  broadcastAll({ type: "objectives_changed" });

  try {
    await wakeConversation(objective.conversationId);
    if (lastAssistantDeclaredDone(objective.conversationId)) {
      setObjectiveStatus(objective.id, "done");
      stopHeartbeat(objective.id);
    }
  } catch (error) {
    recordObjectiveError(objective.id, error?.message || String(error));
  } finally {
    broadcastAll({ type: "objectives_changed" });
  }
};

const startHeartbeat = (objectiveId, { immediate = true } = {}) => {
  stopHeartbeat(objectiveId);
  const objective = getObjective(objectiveId);
  if (!objective || objective.status !== "running") return;

  const intervalMs = Math.max(30, Number(objective.heartbeatSeconds) || 300) * 1000;
  const timer = setInterval(() => {
    void beat(objectiveId);
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  timers.set(String(objectiveId), timer);

  if (immediate) void beat(objectiveId);
};

const stopHeartbeat = (objectiveId) => {
  const timer = timers.get(String(objectiveId));
  if (timer) {
    clearInterval(timer);
    timers.delete(String(objectiveId));
  }
};

const isHeartbeatRunning = (objectiveId) => timers.has(String(objectiveId));

// 服务启动时恢复所有 running 目标的心跳
const restoreHeartbeats = () => {
  const running = listObjectives({ status: "running" });
  for (const objective of running) {
    startHeartbeat(objective.id, { immediate: false });
  }
  return running.length;
};

export { startHeartbeat, stopHeartbeat, isHeartbeatRunning, restoreHeartbeats, beat };
