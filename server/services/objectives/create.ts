// @ts-nocheck
import { createChat } from "../../repository/chats/index.js";
import { insertObjectiveRow } from "../../repository/objectives/index.js";
import { getObjective } from "./get.js";

const HEARTBEAT_MIN = 30;
const HEARTBEAT_MAX = 24 * 60 * 60;

const clampHeartbeat = (value) => {
  const seconds = Number.parseInt(value, 10);
  if (!Number.isFinite(seconds)) return 300;
  return Math.min(HEARTBEAT_MAX, Math.max(HEARTBEAT_MIN, seconds));
};

const createObjective = ({ title, objective, heartbeatSeconds } = {}) => {
  const goal = String(objective || "").trim();
  if (!goal) throw new Error("objective is required");
  const name = String(title || "").trim() || goal.slice(0, 40);

  const chat = createChat(`🎯 ${name}`);
  const heartbeat = clampHeartbeat(heartbeatSeconds);
  const id = insertObjectiveRow({
    conversationId: chat.id,
    title: name,
    objective: goal,
    heartbeatSeconds: heartbeat,
  });

  return getObjective(id);
};

export { createObjective, clampHeartbeat };
