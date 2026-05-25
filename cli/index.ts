#!/usr/bin/env node
// @ts-nocheck

import { commandChat } from "./commands/chat.js";
import { commandHealth } from "./commands/health.js";
import { commandRepl } from "./commands/repl.js";
import { commandSettings } from "./commands/settings.js";
import { ensureServer } from "./lib/server.js";

const main = async () => {
  await ensureServer();

  const [command = "repl", ...args] = process.argv.slice(2);
  if (command === "repl") {
    await commandRepl();
    return;
  }
  if (command === "chat") {
    await commandChat(args);
    return;
  }
  if (command === "settings") {
    await commandSettings(args);
    return;
  }
  if (command === "health") {
    await commandHealth();
    return;
  }

  throw new Error(`unknown command: ${command}`);
};

main().catch((error) => {
  process.stderr.write(`error: ${error.message}\n`);
  process.exitCode = 1;
});
