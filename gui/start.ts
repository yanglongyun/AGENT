// @ts-nocheck

import { spawn } from "child_process";
import { ensureServer } from "../cli/lib/server.js";

const main = async () => {
  await ensureServer();

  const child = spawn("npm", ["run", "dev"], {
    cwd: new URL(".", import.meta.url).pathname,
    stdio: "inherit",
    shell: true,
  });

  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
};

main().catch((error) => {
  process.stderr.write(`error: ${error.message}\n`);
  process.exitCode = 1;
});
