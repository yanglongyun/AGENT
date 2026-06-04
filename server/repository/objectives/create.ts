// @ts-nocheck
import { getDb } from "../db.js";

const insertObjectiveRow = ({ conversationId, title, objective, heartbeatSeconds }) => {
  const row = getDb()
    .prepare(
      `INSERT INTO objectives (conversation_id, title, objective, status, heartbeat_seconds)
       VALUES (?, ?, ?, 'idle', ?)
       RETURNING id`
    )
    .get(String(conversationId), String(title), String(objective), Number(heartbeatSeconds) || 300);
  return row.id;
};

export { insertObjectiveRow };
