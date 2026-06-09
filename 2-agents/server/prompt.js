// @ts-nocheck
// 提示词拼接。
// 让每个对话的 system prompt 同时承担三件事:
// 1) 身份:你是哪个对话(标题/描述)
// 2) 能力:你有 shell;你看得到所有对话,能新建对话、能给任何对话发消息
// 3) 同事:列出所有对话(id/标题/描述),AI 能用 curl 喊他们
//
// 全局底座(settings.system,可在右上角设置里改)放最前面;每个对话自己的 system 拼在身份后。
// 通讯不靠新工具:AI 用 shell + curl 调本机 HTTP API 完成。

const defaultBase =
  "你是一个本地 AI 助手。可以正常回答问题;当需要查看文件系统、执行命令、访问 HTTP API 或处理本地工作时,使用 shell 工具。\n" +
  "只在确实有帮助时使用工具。使用 shell 后,简要说明结果,保持最终回答清晰。";

const apiHowto = (port) => {
  const base = `http://127.0.0.1:${port}`;
  return [
    "## 多对话 API(本机)",
    `- 列出所有对话:  curl ${base}/api/conversations`,
    `- 查看某对话:    curl ${base}/api/conversations/{id}`,
    `- 新建对话:      curl -X POST ${base}/api/conversations -H 'Content-Type: application/json' -d '{"title":"...","description":"...","system":"..."}'`,
    `- 查看对话历史:  curl ${base}/api/conversations/{id}/messages`,
    `- 给对话发消息:  curl -X POST ${base}/api/conversations/{id}/messages -H 'Content-Type: application/json' -d '{"content":"...","from":"你的名字"}'`,
    "",
    "发消息会触发对方那个对话开始处理。对方处理完不会自动通知你——",
    "如果你需要回报,请在你发出的 content 里明确写清楚要求,例如:`完成后请用 POST /api/conversations/{我的id}/messages 把结果发回给我`。",
    "对方按这个约定自己用 shell 调 API 回投消息,你这边的对话就会收到并继续。",
  ].join("\n");
};

const coworkersBlock = (conversation, all = []) => {
  const others = all.filter((c) => c.id !== conversation.id);
  if (!others.length) return "## 其他对话\n- (目前只有你一个对话,可用上面的 API 新建)";
  const lines = ["## 其他对话(你可以联络的)"];
  for (const c of others) {
    const desc = c.description ? ` — ${c.description}` : "";
    lines.push(`- #${c.id} ${c.title}${desc}`);
  }
  return lines.join("\n");
};

const buildSystemPrompt = ({ conversation, allConversations = [], settings = {} } = {}) => {
  const port = process.env.AGENT_PORT || 9500;
  const base = String(settings.system || "").trim() || defaultBase;
  const identity = [
    "## 你是谁",
    `- 你是对话 #${conversation.id}「${conversation.title}」`,
    conversation.description ? `- 描述:${conversation.description}` : "",
  ].filter(Boolean).join("\n");
  const persona = String(conversation.system || "").trim();

  return [
    base,
    identity,
    persona ? `## 你的角色\n${persona}` : "",
    "",
    "## 运行环境",
    `- 工作目录:${process.cwd()}`,
    `- 模型:${settings.model || ""}`,
    "",
    "## 工具",
    "- shell(command, summary, timeout?, cwd?):执行 shell 命令并返回 stdout/stderr。",
    "- 用户提问能直接回答就直接回答。需要做事(查文件、跑命令、调 HTTP API、联络其他对话)再用 shell。",
    "",
    coworkersBlock(conversation, allConversations),
    "",
    apiHowto(port),
  ].filter((part) => String(part ?? "").trim()).join("\n\n");
};

export { buildSystemPrompt, defaultBase };
