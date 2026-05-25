// @ts-nocheck
import { startServer } from "./server/index.js";

const port = Number(process.env.AGENT_PORT) || 9500;

console.log(`Starting AGENT server on port ${port}...`);
await startServer(port);
