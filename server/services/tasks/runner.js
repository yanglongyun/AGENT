import { randomUUID } from "crypto";
import { saveMessageBatch } from "../../repository/messages/index.js";
import {
  createTaskRow,
  markTaskDone,
  markTaskError,
  markTaskRunning,
} from "../../repository/tasks/index.js";
import {
  registerTaskExecution,
  unregisterTaskExecution,
} from "./execution.js";

const createTaskRun = ({
  taskName,
  initialMessages,
  input,
  execute,
}) => {
  const conversationId = randomUUID();
  saveMessageBatch(conversationId, initialMessages);
  const taskId = createTaskRow({
    conversationId,
    name: taskName,
    prompt: initialMessages.find((message) => message.role === "user")?.content || "",
  });

  const controller = new AbortController();
  registerTaskExecution(taskId, controller);
  markTaskRunning(taskId);

  const run = async () => {
    try {
      const result = await execute({
        conversationId,
        input: {
          conversationId,
          messages: initialMessages,
          ...input,
        },
        signal: controller.signal,
      });
      markTaskDone(taskId, result?.response || "");
    } catch (error) {
      if (error?.name !== "AbortError") {
        markTaskError(taskId, error.message);
      }
    } finally {
      unregisterTaskExecution(taskId);
    }
  };

  void run();
  return { taskId, taskName, conversationId };
};

export { createTaskRun };
