// @ts-nocheck
// settings 表的 KV 读写。模型配置与系统提示词都存这里,是唯一来源。
import { getDb } from "./db.js";

const FIELDS = ["apiUrl", "apiKey", "model", "system"];

const getSettings = () => {
  const rows = getDb().prepare("SELECT key, value FROM settings").all();
  const all = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const out = {};
  for (const key of FIELDS) out[key] = all[key] ?? "";
  return out;
};

const setSettings = (settings = {}) => {
  const db = getDb();
  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  for (const key of FIELDS) {
    if (settings[key] != null) stmt.run(key, String(settings[key]));
  }
  return getSettings();
};

export { getSettings, setSettings, FIELDS };
