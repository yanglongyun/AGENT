// @ts-nocheck
import {
  getObjective as getObjectiveRow,
  getObjectiveByConversation as getObjectiveByConversationRow,
  listObjectiveRows,
} from "../../repository/objectives/index.js";

const toObjective = (row) =>
  row
    ? {
        id: row.id,
        conversationId: row.conversation_id,
        title: row.title,
        objective: row.objective,
        status: row.status,
        heartbeatSeconds: row.heartbeat_seconds,
        beats: row.beats,
        lastBeatAt: row.last_beat_at,
        lastError: row.last_error,
        createdAt: row.created_at,
        finishedAt: row.finished_at,
      }
    : null;

const getObjective = (id) => toObjective(getObjectiveRow(id));

const getObjectiveByConversation = (conversationId) =>
  toObjective(getObjectiveByConversationRow(conversationId));

const listObjectives = ({ status } = {}) =>
  listObjectiveRows({ status }).map(toObjective);

export { getObjective, getObjectiveByConversation, listObjectives, toObjective };
