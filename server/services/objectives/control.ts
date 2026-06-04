// @ts-nocheck
import {
  setObjectiveHeartbeat,
  setObjectiveStatus,
} from "../../repository/objectives/index.js";
import { clampHeartbeat } from "./create.js";
import { getObjective } from "./get.js";
import { startHeartbeat, stopHeartbeat } from "./heartbeat.js";

const controlObjective = (id, { action, heartbeatSeconds } = {}) => {
  const objective = getObjective(id);
  if (!objective) throw new Error(`objective ${id} not found`);

  if (heartbeatSeconds != null) {
    setObjectiveHeartbeat(id, clampHeartbeat(heartbeatSeconds));
  }

  switch (action) {
    case "start":
    case "resume":
      setObjectiveStatus(id, "running");
      startHeartbeat(id, { immediate: true });
      break;
    case "pause":
      setObjectiveStatus(id, "paused");
      stopHeartbeat(id);
      break;
    case "done":
    case "stop":
      setObjectiveStatus(id, "done");
      stopHeartbeat(id);
      break;
    case "update":
      // 只改间隔:若在运行中,用新间隔重排
      if (getObjective(id).status === "running") startHeartbeat(id, { immediate: false });
      break;
    default:
      throw new Error(`unknown action: ${action}`);
  }

  return getObjective(id);
};

export { controlObjective };
