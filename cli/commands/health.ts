// @ts-nocheck
import { request } from "../lib/http.js";

const commandHealth = async () => {
  const res = await request("/health");
  process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
};

export { commandHealth };
