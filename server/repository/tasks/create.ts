// @ts-nocheck
import { getDb } from "../db.js";

const createTaskRow = ({ conversationId, name, prompt, notifyConversationId = null, notifyPrompt = null }) => {
  const row = getDb()
    .prepare(
      `INSERT INTO tasks (conversation_id, name, prompt, status, notify_conversation_id, notify_prompt)
       VALUES (?, ?, ?, 'pending', ?, ?)
       RETURNING id`
    )
    .get(
      conversationId,
      name,
      prompt,
      notifyConversationId ? String(notifyConversationId) : null,
      notifyPrompt ? String(notifyPrompt) : null
    );
  return row.id;
};

export { createTaskRow };
