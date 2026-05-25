// @ts-nocheck
const readSseResponse = async (res) => {
  if (!res.ok || !res.body) {
    throw new Error(`stream failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let assistantLineOpen = false;

  const flushLine = () => {
    if (assistantLineOpen) {
      process.stdout.write("\n");
      assistantLineOpen = false;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf("\n\n");
    while (sep >= 0) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      sep = buffer.indexOf("\n\n");

      const lines = event.split("\n").filter(Boolean);
      const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
      const payloadRaw = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");

      if (!eventName || !payloadRaw) continue;
      const payload = JSON.parse(payloadRaw);

      if (eventName === "delta") {
        assistantLineOpen = true;
        process.stdout.write(payload.delta || "");
        continue;
      }

      if (eventName === "tool_call") {
        flushLine();
        const toolName = payload.toolCall?.function?.name || "tool";
        process.stdout.write(`\n[tool] ${toolName}\n`);
        continue;
      }

      if (eventName === "tool_result") {
        flushLine();
        const content = payload.message?.content || "";
        process.stdout.write(`[tool-result]\n${content}\n`);
        continue;
      }

      if (eventName === "error") {
        flushLine();
        throw new Error(payload.error || "stream error");
      }

      if (eventName === "end" || eventName === "stopped") {
        flushLine();
        return;
      }
    }
  }
};

export { readSseResponse };
