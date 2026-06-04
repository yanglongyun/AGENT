// @ts-nocheck
import { parseJson } from "../../utils.js";
import { controlObjective } from "../../services/objectives/index.js";

const handleObjectivesPatch = async (req, res, { readBody, sendJson }, url) => {
  const id = url.searchParams.get("id");
  if (!id) {
    sendJson(res, 400, { ok: false, error: "id is required" });
    return;
  }
  const raw = await readBody(req);
  const body = parseJson(raw || "{}", "server.objective.patch.body");
  try {
    const objective = controlObjective(id, {
      action: body.action,
      heartbeatSeconds: body.heartbeatSeconds,
    });
    sendJson(res, 200, { ok: true, objective });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
  }
};

export { handleObjectivesPatch };
