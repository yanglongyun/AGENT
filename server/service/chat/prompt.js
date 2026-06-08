// @ts-nocheck
const defaultInstruction = `You are Agent Chat, a local AI assistant.

You can answer normally and you can use the shell tool when local verification, filesystem inspection, command execution, or development work is needed.
Use tools only when they are useful. When you use shell, explain the result briefly and keep the final answer clear.`;

const buildSystemPrompt = (chatId, _contextMessages = [], settings = {}) => {
  const instruction = String(settings.system || "").trim() || defaultInstruction;
  return [
    instruction,
    "",
    "## Runtime",
    `- Current chatId: ${chatId}`,
    `- Working directory: ${process.cwd()}`,
    `- Model: ${settings.model || ""}`,
    "",
    "## Tools",
    "- shell(command, summary, timeout?, cwd?): execute a shell command and return stdout/stderr.",
    "- Use shell for local files, code, tests, installs, builds, and command-line tasks.",
    "- For pure conversation, answer directly without tools.",
  ].join("\n");
};

export { buildSystemPrompt };
