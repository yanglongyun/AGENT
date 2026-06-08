// @ts-nocheck
import { getDb } from "../db.js";

const nextUpdateVersion = () =>
  Number(getDb().prepare("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM updates").get()?.version || 1);

const createUpdateRow = ({ title, description = "", version = null }) =>
  getDb()
    .prepare(
      `INSERT INTO updates (version, title, description)
       VALUES (?, ?, ?)
       RETURNING *`,
    )
    .get(Number(version) || nextUpdateVersion(), String(title || "").trim(), String(description || "").trim());

export { createUpdateRow, nextUpdateVersion };
