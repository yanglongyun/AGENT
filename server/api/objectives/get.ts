// @ts-nocheck
import { getObjective, listObjectives } from "../../services/objectives/index.js";

const handleObjectivesGet = async (_req, res, { sendJson }, url) => {
  const id = url.searchParams.get("id");
  if (id) {
    const objective = getObjective(id);
    if (!objective) {
      sendJson(res, 404, { ok: false, error: "objective not found" });
      return;
    }
    sendJson(res, 200, { ok: true, objective });
    return;
  }
  const status = url.searchParams.get("status") || undefined;
  const objectives = listObjectives({ status });
  sendJson(res, 200, { ok: true, objectives });
};

export { handleObjectivesGet };
