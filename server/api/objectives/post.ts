// @ts-nocheck
import { parseJson } from "../../utils.js";
import { createObjective } from "../../services/objectives/index.js";

const handleObjectivePost = async (req, res, { readBody, sendJson }) => {
  const raw = await readBody(req);
  const body = parseJson(raw || "{}", "server.objective.body");
  try {
    const objective = createObjective({
      title: body.title,
      objective: body.objective,
      heartbeatSeconds: body.heartbeatSeconds,
    });
    sendJson(res, 201, { ok: true, objective });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
  }
};

export { handleObjectivePost };
