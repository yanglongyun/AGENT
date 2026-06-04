// @ts-nocheck
import { getDb } from "../db.js";

const setObjectiveStatus = (id, status) => {
  const finishing = status === "done";
  getDb()
    .prepare(
      `UPDATE objectives
       SET status = ?,
           finished_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE finished_at END
       WHERE id = ?`
    )
    .run(String(status), finishing ? 1 : 0, Number(id));
};

const setObjectiveHeartbeat = (id, heartbeatSeconds) => {
  getDb()
    .prepare("UPDATE objectives SET heartbeat_seconds = ? WHERE id = ?")
    .run(Number(heartbeatSeconds) || 300, Number(id));
};

const recordObjectiveBeat = (id) => {
  getDb()
    .prepare(
      `UPDATE objectives
       SET beats = beats + 1,
           last_beat_at = CURRENT_TIMESTAMP,
           last_error = NULL
       WHERE id = ?`
    )
    .run(Number(id));
};

const recordObjectiveError = (id, error) => {
  getDb()
    .prepare("UPDATE objectives SET last_error = ? WHERE id = ?")
    .run(error ? String(error) : null, Number(id));
};

export {
  setObjectiveStatus,
  setObjectiveHeartbeat,
  recordObjectiveBeat,
  recordObjectiveError,
};
