// @ts-nocheck
import { randomUUID } from "crypto";
import { saveMessageBatch } from "../../repository/messages/index.js";
import {
  createTaskRow,
  getTask,
  markTaskAborted,
  markTaskDone,
  markTaskError,
  markTaskRunning,
} from "../../repository/tasks/index.js";
import { notifyTaskFinished } from "./notify.js";
import {
  registerTaskExecution,
  unregisterTaskExecution,
} from "./execution.js";

const createTaskRun = ({
  taskName,
  initialMessages,
  input,
  execute,
  notifyConversationId = null,
  notifyPrompt = null,
}) => {
  const conversationId = randomUUID();
  saveMessageBatch(conversationId, initialMessages);
  const taskId = createTaskRow({
    conversationId,
    name: taskName,
    prompt: initialMessages.find((message) => message.role === "user")?.content || "",
    notifyConversationId,
    notifyPrompt,
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
      const response = result?.response || "";
      markTaskDone(taskId, response);
      notifyTaskFinished(getTask(taskId), { event: "done", payload: response });
    } catch (error) {
      if (error?.name === "AbortError") {
        markTaskAborted(taskId);
        notifyTaskFinished(getTask(taskId), { event: "aborted", payload: "用户中止任务" });
      } else {
        markTaskError(taskId, error.message);
        notifyTaskFinished(getTask(taskId), { event: "error", payload: error.message });
      }
    } finally {
      unregisterTaskExecution(taskId);
    }
  };

  void run();
  return { taskId, taskName, conversationId };
};

export { createTaskRun };
