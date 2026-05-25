// @ts-nocheck
import fs from "fs";
import { spawn } from "child_process";
import { REPO_ROOT, SERVER_ENTRY, SERVER_LOG, TSX_ENTRY } from "../runtime.js";
import { request } from "./http.js";

let managedServerChild = null;
let cleanupBound = false;

const checkServer = async () => {
  try {
    await request("/health");
    return true;
  } catch {
    return false;
  }
};

const waitForServer = async (timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkServer()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
};

const stopManagedServer = () => {
  if (!managedServerChild || managedServerChild.killed) return;
  try {
    managedServerChild.kill("SIGTERM");
  } catch {
    // Ignore cleanup failures during process shutdown.
  }
};

const bindCleanup = () => {
  if (cleanupBound) return;
  cleanupBound = true;

  process.on("exit", () => {
    stopManagedServer();
  });

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      stopManagedServer();
      process.exitCode = signal === "SIGINT" ? 130 : 0;
      process.exit();
    });
  }
};

const spawnServer = () => {
  const log = fs.openSync(SERVER_LOG, "a");
  const child = spawn(TSX_ENTRY, [SERVER_ENTRY], {
    stdio: ["ignore", log, log],
    cwd: REPO_ROOT,
  });
  managedServerChild = child;
  child.unref();
  child.once("exit", () => {
    if (managedServerChild?.pid === child.pid) {
      managedServerChild = null;
    }
  });
  bindCleanup();
  return child.pid;
};

const ensureServer = async () => {
  if (await checkServer()) return;
  const pid = spawnServer();
  process.stderr.write(`starting agent kernel (pid ${pid})...\n`);
  if (!(await waitForServer(10000))) {
    throw new Error(`failed to start server, see ${SERVER_LOG}`);
  }
};

export { checkServer, ensureServer };
