# AGENT 0.0.1

## 版本定位

0.0.1 是项目的第一个可运行基线，目标是建立一个边界清晰、无状态、可嵌入其他应用的 AI 内核，并提供一个具有 Bash 和文件操作能力的交互式 CLI Agent。

## 目录结构

```text
ai/
├── index.js          # 无状态 Agent 循环
├── responses.js      # Responses API 请求与流式事件解析
├── runner.js         # 工具调用调度
├── complete.js       # 一次性无工具补全
└── events.js         # AI 输出事件契约

agent/
├── cli.js            # 终端交互入口
├── index.js          # Agent 工具装配入口
├── compact.js        # 跨轮上下文压缩
├── tools.js          # 发给模型的纯工具定义表
└── functions/
    ├── bash.js       # Bash 执行器
    ├── read.js       # 文本读取
    ├── write.js      # 文件创建与覆盖
    └── edit.js       # 精确文本替换
```

## 核心设计

### 无状态 AI 内核

`ai/index.js` 直接导出 `runAgent()`。每次运行所需的模型、指令、输入、工具、执行器、工作目录、取消信号和事件回调全部通过参数传入。

AI 内核不保存任务列表，不提供 `createAgent()`、`stop()` 或 `status()`。任务生命周期由调用方通过 `AbortController` 管理。

### 工具注入

`agent/tools.js` 只保存 Responses API 可见的工具定义，不导入任何执行器。

`agent/index.js` 建立工具名称与执行函数的映射，然后将定义表和执行映射一起注入 AI 内核。

```text
tools.js 工具定义
        +
functions/* 执行器
        ↓
agent/index.js 装配
        ↓
ai/index.js 循环
        ↓
ai/runner.js 按名称执行
```

### 工具摘要

`bash`、`read`、`write` 和 `edit` 均要求模型提供必填的 `summary` 参数，用一句话说明本次调用的目的。`summary` 用于事件展示，不参与工具执行。

## Responses API 请求

AI 内核向 Responses API 发送的主要内容：

```js
{
    model,
    instructions,
    input,
    tools,
    stream: true,
}
```

模型返回 `function_call` 后，`runner.js` 根据执行映射运行对应工具，并将 `function_call_output` 加入下一轮模型输入。

## 输出事件

```text
message
reasoning
function_call
function_call_output
done
error
```

事件名不带 `agent.` 前缀，因为它们属于 AI 内核的通用输出协议。

## CLI

CLI 负责：

- 读取用户输入
- 维护内存中的对话历史
- 流式显示模型输出
- 显示工具名称和 `summary`
- 使用 `Ctrl+C` 取消当前运行
- 使用 `/exit` 退出
- 在两轮运行之间检查并压缩上下文

## 上下文压缩

压缩由 `agent/compact.js` 执行，策略全部来自 `config.compaction`。

当最近一次用量达到上下文窗口的配置水位时：

1. 保留近期对话尾部。
2. 将较早历史交给 `complete()` 生成摘要。
3. 将摘要作为系统消息放回上下文。
4. 如果模型摘要失败或不合格，使用确定性机械索引兜底。

压缩发生在两次 `runAgent()` 之间，不修改 AI 内核的单次工具循环。

## 配置

项目从根目录 `config.js` 读取本地配置。该文件已被 Git 忽略，仓库只保留 `config.example.js`。

首次使用时：

```bash
cp config.example.js config.js
```

然后在 `config.js` 中填写 `apiKey`、`model` 和其他运行策略。

## 启动

```bash
npm start
```

## 0.0.1 已知限制

- 对话历史只保存在内存中，退出 CLI 后不保留。
- 工具调用目前串行执行。
- Responses API 流解析还需要更完整的 SSE 边界测试。
- Bash 具有本机命令执行权限，当前没有命令审批或沙箱。
- `read`、`write` 和 `edit` 使用工作目录解析路径，尚未实现严格的工作区边界限制。
- 尚未建立自动化测试套件。

## 下一版候选工作

- 完善 SSE 解析和错误协议。
- 增加会话持久化。
- 增加工具审批和工作区路径边界。
- 为 AI 循环、工具调度和压缩策略增加测试。
- 提供稳定的应用嵌入 API。
