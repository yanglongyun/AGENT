// @ts-nocheck
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDb } from "../db.js";

const normalizeRootPath = (value) => {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("space path is required");
  const expanded = raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : raw;
  const root = path.resolve(expanded);
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) throw new Error("space path must be a directory");
  return root;
};

const normalizeRelativePath = (value = ".") => {
  const raw = String(value || ".").trim() || ".";
  const normalized = path.normalize(raw).replace(/^\/+/, "");
  if (normalized === "." || normalized === "") return ".";
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) throw new Error("relative path is outside space");
  return normalized;
};

const resolveSpacePath = (space, relativePath = ".") => {
  if (!space) throw new Error("space not found");
  const rel = normalizeRelativePath(relativePath);
  const abs = path.resolve(space.root_path, rel);
  const root = path.resolve(space.root_path);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error("path is outside space");
  return abs;
};

const parseSpace = (row) => row || null;

const createSpace = ({ name, path: rootPath, rootPath: rootPathAlias } = {}) => {
  const root = normalizeRootPath(rootPath || rootPathAlias);
  const title = String(name || path.basename(root) || "Space").trim() || "Space";
  const id = randomUUID();
  getDb().prepare(`
    INSERT INTO spaces (id, name, root_path, updated_at, last_opened_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `).run(id, title, root);
  return getSpace(id);
};

const listSpaces = () => getDb().prepare(`
  SELECT id, name, root_path, created_at, updated_at, last_opened_at
  FROM spaces
  ORDER BY COALESCE(last_opened_at, created_at) DESC, name ASC
`).all().map(parseSpace);

const getSpace = (id) => {
  const row = getDb().prepare(`
    SELECT id, name, root_path, created_at, updated_at, last_opened_at
    FROM spaces
    WHERE id = ?
  `).get(String(id || "").trim());
  return parseSpace(row);
};

const touchSpace = (id) => {
  getDb().prepare("UPDATE spaces SET last_opened_at = datetime('now') WHERE id = ?").run(String(id || "").trim());
};

const removeSpace = (id) => {
  getDb().prepare("DELETE FROM spaces WHERE id = ?").run(String(id || "").trim());
};

const ignoredNames = new Set([".git", "node_modules", "dist", "build", ".next", ".cache", ".turbo"]);

const listSpaceChildren = ({ spaceId, relativePath = "." } = {}) => {
  const space = getSpace(spaceId);
  const dir = resolveSpacePath(space, relativePath);
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) throw new Error("path is not a directory");
  touchSpace(space.id);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith(".") && !ignoredNames.has(entry.name))
    .map((entry) => {
      const rel = normalizeRelativePath(path.join(normalizeRelativePath(relativePath), entry.name));
      const abs = path.join(dir, entry.name);
      const itemStat = fs.statSync(abs);
      return {
        name: entry.name,
        relative_path: rel,
        kind: entry.isDirectory() ? "directory" : "file",
        size: itemStat.size,
        updated_at: itemStat.mtime.toISOString(),
      };
    })
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1));
};

const createSpaceChat = ({ spaceId, relativePath = ".", chatId } = {}) => {
  const space = getSpace(spaceId);
  const dir = resolveSpacePath(space, relativePath);
  if (!fs.statSync(dir).isDirectory()) throw new Error("chat path must be a directory");
  const rel = normalizeRelativePath(relativePath);
  getDb().prepare(`
    INSERT INTO space_chats (space_id, chat_id, relative_path, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(space.id, String(chatId || "").trim(), rel);
  return getSpaceChatByChatId(chatId);
};

const listSpaceChats = ({ spaceId, relativePath = null } = {}) => {
  const params = [String(spaceId || "").trim()];
  let where = "sc.space_id = ?";
  if (relativePath != null) {
    where += " AND sc.relative_path = ?";
    params.push(normalizeRelativePath(relativePath));
  }
  return getDb().prepare(`
    SELECT sc.*, s.name AS space_name, s.root_path, c.title, c.state, c.created_at AS chat_created_at,
      COUNT(m.id) AS message_count, MAX(m.created_at) AS updated_at
    FROM space_chats sc
    JOIN spaces s ON s.id = sc.space_id
    JOIN chats c ON c.id = sc.chat_id
    LEFT JOIN messages m ON m.chat_id = c.id
    WHERE ${where}
    GROUP BY sc.id
    ORDER BY COALESCE(MAX(m.id), 0) DESC, sc.created_at DESC
  `).all(...params).map((row) => ({
    ...row,
    updated_at: row.updated_at || row.chat_created_at,
  }));
};

const getSpaceChatByChatId = (chatId) => getDb().prepare(`
  SELECT sc.*, s.name AS space_name, s.root_path
  FROM space_chats sc
  JOIN spaces s ON s.id = sc.space_id
  WHERE sc.chat_id = ?
`).get(String(chatId || "").trim()) || null;

const getSpaceChatContext = (chatId) => {
  const row = getSpaceChatByChatId(chatId);
  if (!row) return null;
  const cwd = resolveSpacePath({ id: row.space_id, root_path: row.root_path }, row.relative_path);
  return { ...row, cwd };
};

export {
  createSpace,
  createSpaceChat,
  getSpace,
  getSpaceChatByChatId,
  getSpaceChatContext,
  listSpaceChats,
  listSpaceChildren,
  listSpaces,
  normalizeRelativePath,
  removeSpace,
  resolveSpacePath,
};
