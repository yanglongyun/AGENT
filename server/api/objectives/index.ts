// @ts-nocheck
import { handleObjectivesGet } from "./get.js";
import { handleObjectivePost } from "./post.js";
import { handleObjectivesPatch } from "./patch.js";

const handleObjectivesApi = async (req, res, deps, path, method, url) => {
  const { sendJson } = deps;
  if (path !== "/api/objectives") {
    sendJson(res, 404, { ok: false, error: "Not found" });
    return;
  }
  if (method === "GET") {
    await handleObjectivesGet(req, res, deps, url);
    return;
  }
  if (method === "POST") {
    await handleObjectivePost(req, res, deps);
    return;
  }
  if (method === "PATCH") {
    await handleObjectivesPatch(req, res, deps, url);
    return;
  }
  sendJson(res, 404, { ok: false, error: "Not found" });
};

export { handleObjectivesApi };
