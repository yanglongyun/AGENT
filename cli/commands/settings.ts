// @ts-nocheck
import { request } from "../lib/http.js";

const commandSettings = async (args) => {
  const action = args[0] || "get";
  if (action === "get") {
    const res = await request("/api/settings");
    process.stdout.write(`${JSON.stringify(res.settings || {}, null, 2)}\n`);
    return;
  }

  if (action === "set") {
    const next = {};
    for (const pair of args.slice(1)) {
      const idx = pair.indexOf("=");
      if (idx <= 0) continue;
      next[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
    await request("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    process.stdout.write("settings saved\n");
    return;
  }

  throw new Error(`unknown settings action: ${action}`);
};

export { commandSettings };
