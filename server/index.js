#!/usr/bin/env node

import { startServer, stopServer } from "./runtime/http.js";

if (process.argv[1] && process.argv[1].includes("server/index.js")) {
  const port = Number(process.env.AGENT_PORT) || 9500;
  startServer(port).catch(console.error);
}

export { startServer, stopServer };
