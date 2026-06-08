// @ts-nocheck
import { getDb } from "../db.js";

const listUpdateRows = ({ limit = 100 } = {}) =>
  getDb()
    .prepare("SELECT * FROM updates ORDER BY version DESC, id DESC LIMIT ?")
    .all(Math.max(1, Math.min(500, Number(limit) || 100)));

export { listUpdateRows };
