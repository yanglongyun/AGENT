// @ts-nocheck
import { createUpdateRow, listUpdateRows } from "../../repository/updates/index.js";

const normalizeTitle = (value) => {
  const title = String(value || "").trim();
  if (!title) throw new Error("update title is required");
  return title.slice(0, 160);
};

const createUpdate = ({ title, description = "", version = null } = {}) =>
  createUpdateRow({
    title: normalizeTitle(title),
    description: String(description || "").trim(),
    version,
  });

const listUpdates = ({ limit = 100 } = {}) => listUpdateRows({ limit });

export { createUpdate, listUpdates };
