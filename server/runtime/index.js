// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getAsset, isSea } from "node:sea";

const PACKAGED = isSea();
const SOURCE_ROOT = PACKAGED
  ? process.cwd()
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const platformDataRoot = () => {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Agent Chat");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Agent Chat");
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "agent-chat");
};

const DATA_ROOT = path.resolve(
  process.env.AGENT_DATA_DIR || (PACKAGED ? platformDataRoot() : SOURCE_ROOT),
);
const DATABASE_PATH = PACKAGED ? path.join(DATA_ROOT, "agent.db") : path.join(DATA_ROOT, "data", "agent.db");
const UPLOADS_ROOT = path.join(DATA_ROOT, "uploads");
const SKILLS_ROOT = path.join(DATA_ROOT, "skills");
const WORKSPACE_ROOT = path.resolve(
  process.env.AGENT_WORKSPACE_DIR || (PACKAGED ? os.homedir() : SOURCE_ROOT),
);
const STATIC_ROOT = fs.existsSync(path.join(SOURCE_ROOT, "dist"))
  ? path.join(SOURCE_ROOT, "dist")
  : SOURCE_ROOT;

const assetBuffer = (key) => Buffer.from(getAsset(key));

const readStaticAsset = async (requestPath) => {
  if (!PACKAGED) return null;
  const clean = String(requestPath || "/index.html").replace(/^\/+/, "");
  try {
    return assetBuffer(`dist/${clean}`);
  } catch {
    return assetBuffer("dist/index.html");
  }
};

const seedBundledSkills = () => {
  if (!PACKAGED) return;
  let manifest;
  try {
    manifest = JSON.parse(assetBuffer("release-manifest.json").toString("utf8"));
  } catch {
    return;
  }
  for (const skill of manifest.skills || []) {
    const target = path.join(SKILLS_ROOT, skill.path);
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, assetBuffer(skill.asset));
  }
};

const initializeRuntime = () => {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
  fs.mkdirSync(SKILLS_ROOT, { recursive: true });
  seedBundledSkills();
};

const openExternal = (url) => {
  if (process.env.AGENT_NO_OPEN === "1") return;
  let command;
  let args;
  if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
};

const runtimeInfo = () => ({
  packaged: PACKAGED,
  dataRoot: DATA_ROOT,
  workspaceRoot: WORKSPACE_ROOT,
});

export {
  DATABASE_PATH,
  PACKAGED,
  SKILLS_ROOT,
  STATIC_ROOT,
  UPLOADS_ROOT,
  WORKSPACE_ROOT,
  initializeRuntime,
  openExternal,
  readStaticAsset,
  runtimeInfo,
};
