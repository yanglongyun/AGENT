// @ts-nocheck
import { getObjectiveByConversation } from "../objectives/get.js";

// 若当前会话绑定了一个目标,把北极星目标常驻进 system prompt(防漂移)。
const objective = (conversationId) => {
  if (!conversationId) return "";
  const obj = getObjectiveByConversation(conversationId);
  if (!obj) return "";

  return [
    "",
    "## 自主运营目标",
    "<objective>",
    `状态:${obj.status} · 心跳间隔:${obj.heartbeatSeconds}s · 已心跳:${obj.beats} 次`,
    `北极星目标:${obj.objective}`,
    "",
    "你在自主运营模式下运行:每次心跳都要朝这个目标推进一步,而不是被动等待指令。",
    "始终以这个目标为锚,不要跑偏到无关的事情上。",
    "</objective>",
  ].join("\n");
};

export { objective };
