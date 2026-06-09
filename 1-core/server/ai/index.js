// @ts-nocheck
// 工具调用循环。
// core 不对历史做任何加工:传进来的 messages(system + 库里读出的历史)直接拼成
// 请求发给模型;模型每轮返回的整条 message 也原样塞回历史,继续下一轮。
import { tools } from "./tools.js";
import { runTools } from "./runner.js";
import { callLlmStream } from "./llm.js";

const chat = async (messages, {
  apiUrl,
  apiKey,
  model,
  onEvent = () => {},
  signal,
  maxRounds = 50,
} = {}) => {
  const workMessages = Array.isArray(messages) ? [...messages] : [];
  let round = 0;

  while (round++ < maxRounds) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const payload = { model, messages: workMessages, tools };

    const result = await callLlmStream(apiUrl, apiKey, payload, {
      signal,
      onMessage: (content) => onEvent({ type: "message", content }),
    });
    const message = result.message;

    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      workMessages.push(message);
      onEvent({ type: "tool_calls", message });
      const toolMessages = await runTools(message.tool_calls, { signal });
      for (const toolMessage of toolMessages) {
        workMessages.push(toolMessage);
      }
      onEvent({ type: "tool_results", messages: toolMessages });
      continue;
    }

    workMessages.push(message);
    const text = message.content ?? "";
    if (result.usage) onEvent({ type: "usage", usage: result.usage });
    onEvent({ type: "done", message, text, usage: result.usage || null });
    return { text, messages: workMessages };
  }

  const text = "(达到最大轮次限制)";
  const replyMsg = { role: "assistant", content: text };
  workMessages.push(replyMsg);
  onEvent({ type: "done", message: replyMsg, text });
  return { text, messages: workMessages };
};

export { chat };
