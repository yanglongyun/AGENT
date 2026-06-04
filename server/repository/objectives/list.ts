// @ts-nocheck
import { getDb } from "../db.js";

const listObjectiveRows = ({ status, limit = 100 } = {}) => {
  const db = getDb();
  if (status) {
    return db
      .prepare("SELECT * FROM objectives WHERE status = ? ORDER BY id DESC LIMIT ?")
      .all(String(status), limit);
  }
  return db.prepare("SELECT * FROM objectives ORDER BY id DESC LIMIT ?").all(limit);
};

export { listObjectiveRows };
