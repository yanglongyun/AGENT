const tools = ({
  enableToolResultTruncate = true,
  toolResultMaxChars = 12000,
  enableToolLoopLimit = true,
  toolMaxRounds = 50,
} = {}) => `

## 工具
你只有一个工具: shell。

- shell(command, reason, timeout?, cwd?): 执行 shell 命令并返回输出。
- reason 必须简短说明为什么执行该命令。
- 默认超时 30 秒；安装、构建、测试等耗时任务要显式设置更长 timeout。
- 读文件优先用 rg/sed/head/tail；避免一次输出过多内容。
- 工具结果截断: ${enableToolResultTruncate ? "开启" : "关闭"}
- 工具结果最大长度: ${toolResultMaxChars}
- 工具循环限制: ${enableToolLoopLimit ? "开启" : "关闭"}
- 工具最大循环轮次: ${toolMaxRounds}`;

export { tools };
