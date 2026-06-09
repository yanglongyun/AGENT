// @ts-nocheck
// 系统提示词:开头用设置里的自定义提示词(没填则用默认),后面拼接工具与运行环境。
const defaultInstruction =
  "你是一个本地 AI 助手。可以正常回答问题；当需要查看文件系统、执行命令或处理本地开发工作时,使用 shell 工具。\n只在确实有帮助时使用工具。使用 shell 后,简要说明结果,保持最终回答清晰。";

const buildSystemPrompt = (settings = {}) =>
  [
    String(settings.system || "").trim() || defaultInstruction,
    "",
    "## 运行环境",
    `- 工作目录:${process.cwd()}`,
    `- 模型:${settings.model || ""}`,
    "",
    "## 工具",
    "- shell(command, summary, timeout?, cwd?):执行 shell 命令并返回 stdout/stderr。",
    "- 纯对话场景直接回答,不要使用工具。",
  ].join("\n");

export { buildSystemPrompt, defaultInstruction };
