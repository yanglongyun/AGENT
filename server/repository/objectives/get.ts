// @ts-nocheck
import { getDb } from "../db.js";

const getObjective = (id) =>
  getDb().prepare("SELECT * FROM objectives WHERE id = ?").get(Number(id)) || null;

const getObjectiveByConversation = (conversationId) =>
  getDb()
    .prepare("SELECT * FROM objectives WHERE conversation_id = ? ORDER BY id DESC LIMIT 1")
    .get(String(conversationId)) || null;

export { getObjective, getObjectiveByConversation };
