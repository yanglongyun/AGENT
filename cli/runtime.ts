// @ts-nocheck
import path from "path";
import { fileURLToPath } from "url";

const SERVER_URL = process.env.AGENT_SERVER_URL || "http://127.0.0.1:9500";
const CLI_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CLI_DIR, "..");
const SERVER_ENTRY = path.join(REPO_ROOT, "index.ts");
const TSX_ENTRY = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
const SERVER_LOG = path.join(REPO_ROOT, "agent-server.log");

export { REPO_ROOT, SERVER_ENTRY, SERVER_LOG, SERVER_URL, TSX_ENTRY };
