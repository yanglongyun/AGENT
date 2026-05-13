const SHELL_TOOL_NAMES = new Set(["shell"]);

const parseToolArgs = (raw) => {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const buildToolMessage = (toolCall, id) => {
  const name = toolCall?.function?.name || "";
  const args = parseToolArgs(toolCall?.function?.arguments);
  const isShell = SHELL_TOOL_NAMES.has(name) && args && args.command;
  const sub = args?.sessionId
    ? `session ${String(args.sessionId).slice(0, 8)}`
    : args?.signal
      ? `signal ${args.signal}`
      : "";
  return {
    role: "tool",
    _id: id,
    toolCallId: toolCall?.id || "",
    toolName: name || "tool",
    toolSub: sub,
    shell: !!isShell,
    command: isShell ? String(args.command) : "",
    args: args && !isShell ? JSON.stringify(args, null, 2) : "",
    result: null,
    expanded: false,
  };
};

export const normalizeForDisplay = (raw) => {
  const out = [];
  if (!Array.isArray(raw)) return out;

  for (const msg of raw) {
    if (!msg || typeof msg !== "object") continue;
    const baseId = msg._id != null ? `db:${msg._id}` : `mem:${Math.random()}`;

    if (msg.role === "system") continue;

    if (
      msg.role === "assistant" &&
      Array.isArray(msg.tool_calls) &&
      msg.tool_calls.length > 0
    ) {
      if (msg.content) {
        out.push({
          role: "assistant",
          content: msg.content,
          _id: `${baseId}:a`,
          memo: msg.memo,
        });
      }
      msg.tool_calls.forEach((tc, i) => {
        out.push(buildToolMessage(tc, `${baseId}:tc:${i}`));
      });
      continue;
    }

    if (msg.role === "tool") {
      let target = -1;
      if (msg.tool_call_id) {
        for (let i = out.length - 1; i >= 0; i -= 1) {
          if (
            out[i].role === "tool" &&
            out[i].toolCallId === msg.tool_call_id
          ) {
            target = i;
            break;
          }
        }
      }
      if (target < 0) {
        for (let i = out.length - 1; i >= 0; i -= 1) {
          if (out[i].role === "tool" && out[i].result == null) {
            target = i;
            break;
          }
        }
      }
      if (target >= 0) {
        out[target].result = msg.content ?? "";
      } else {
        out.push({
          role: "tool",
          _id: `${baseId}:tr`,
          toolName: "tool",
          orphan: true,
          result: msg.content ?? "",
          expanded: false,
        });
      }
      continue;
    }

    if (msg.role === "user" && msg.content) {
      out.push({
        role: "user",
        content: msg.content,
        _id: `${baseId}:u`,
      });
      continue;
    }

    if (msg.role === "assistant" && msg.content) {
      out.push({
        role: "assistant",
        content: msg.content,
        _id: `${baseId}:a`,
        memo: msg.memo,
      });
    }
  }
  return out;
};

export const previewText = (value, fallback = "暂无内容") => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
};

export const formatTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const titleFromPrompt = (text) => {
  const trimmed = String(text || "").trim();
  return trimmed.slice(0, 24) || "untitled";
};
