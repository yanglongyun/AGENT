# 0.0.7 — 内核正确性修复

这一版不加功能，只修内核里会**静默出错**和**一抖就整轮丢失**的地方。全部已实现，34 个测试通过。

## 背景

把 `ai/` + `agent/` 与 `earendil-works/pi`（MIT）逐项对照后确认：主循环没有问题，`ai/index.js` 的轮次结构与 pi 的 `agent-loop.ts` 同构，差异全在事件类型和遥测上。

缺口集中在两处：

```text
ai/responses.js        模型边界——没有重试，没有截断判定，请求体只有 5 个字段
agent/functions/       文件工具正确性——替换模式泄漏，CRLF 多行匹配失败
```

## 问题

| # | 位置 | 问题 | 严重度 |
|---|---|---|---|
| 1 | `agent/functions/edit.js:17` | `$&` 等替换模式导致静默写错文件 | 高 |
| 2 | `ai/responses.js:17` | 无任何重试，一次 429 整轮丢失 | 高 |
| 3 | `ai/responses.js:42,48` | 截断与断流被当作正常完成 | 高 |
| 4 | `agent/functions/edit.js:11` `read.js:17` | CRLF 文件上多行 `old_text` 必失败 | 中 |
| 5 | `config.js` `bash.js` | `/bin/zsh` 硬编码，Windows 上 bash 起不来 | 中 |
| 6 | `ai/responses.js:14` | 缺 `reasoning` / `max_output_tokens` 等参数 | 中 |
| 7 | `ai/responses.js:36` | 监听 reasoning summary 但从不请求 | 低 |
| 8 | 全仓库 | 零测试，`check` 未覆盖以上任何文件 | 中 |

### 1. `$&` 静默损坏

`String.prototype.replace` 即使第一个参数是普通字符串，第二个参数里的 `$&`、`` $` ``、`$'`、`$n`、`$$` 仍按替换模式解释。实测（Node 22）：

```text
"const price = OLD;".replace("OLD", 'x.replace(/a/, "$&!")')
→ const price = x.replace(/a/, "OLD!");        $& 被替换成被匹配文本

"A B C".replace("B", "$`")  → A A  C           $` 插入前文
"A B C".replace("B", "$$")  → A $ C            $$ 折叠为一个 $
```

不抛异常，直接写进文件。触发面是 `new_text` 含 `$`——正则替换代码、shell、模板字符串、`$1` 分组引用都会中。且**默认路径就是坏的那条**：`replace_all` 缺省 `false`；`replace_all: true` 走 `split/join`，反而安全。

### 3. 截断与断流

两种情况都会把半截回复当成功返回：

```text
response.incomplete    与 completed 同等处理，只记 usage
流中途断开             无任何终结事件，for await 正常退出，返回 usage: {}
```

上层据此 `emit(DONE, { status: 'completed' })` 并入库。

### 4. CRLF

`read.js` 的 `split('\n')` 让每行尾部留下 `\r` 原样返回给模型；模型构造 `old_text` 时通常丢掉 `\r`，`edit.js` 再对原始内容精确匹配。实测 `line1\r\nline2\r\nline3\r\n`：

```text
old_text = "line2"            → 匹配 1 次，成功（\r 在行尾，不影响子串）
old_text = "line1\nline2"     → 匹配 0 次，抛「未找到 old_text」
total_lines                   → 报 4，实际 3（尾随换行产生空元素）
```

即：**单行编辑通常能过，多行编辑必失败**。

### 5. Windows

`config.example.js` 与 `config.js` 里 `bash.executable: '/bin/zsh'` 是硬编码，全仓库只有 `bash.js:35,50` 两处 `win32` 进程组处理，没有 shell 选型分支。README 声明支持 Windows，`package.json` 也配了 Windows 构建，但 bash 工具在 Windows 上直接起不来。修 CRLF 不解决这个。

## 已修复

### `agent/functions/edit.js` — 替换模式与行尾

按下标切片拼接，不再走 `String.replace`；匹配前把文件、`old_text`、`new_text` 统一归一到 LF，写回前还原原始行尾。

```text
$& / $` / $' / $n / $$    原样写入，不再被解释
CRLF 多行 old_text        匹配成功，写回仍是 CRLF
LF 文件                   字节不变，不被顺手改写行尾
孤立的 \r(经典 Mac)      不当作行尾，保持不动
```

### `agent/functions/read.js` — 与 edit 同口径

返回前归一到 LF，模型不会再看到行尾的 `\r`；尾随换行切出的空串不计入行数，`total_lines` 不再整体多 1。

### `agent/functions/text.js` — 新增

`detectLineEnding` / `toLf` / `restoreLineEnding` 三个纯函数，被 read 和 edit 共用，保证两边口径只有一份定义。

### `ai/retry.js` — 新增

判定顺序固定：

```text
1. 额度 / 账单文本    终态,永不重试(insufficient_quota、billing、available balance …)
2. HTTP 状态码        408 409 425 429 500 502 503 504 524 可重试;其余 4xx 终态
3. 错误文本兜底       仅在拿不到状态码时使用(fetch failed、socket hang up、EAI_AGAIN …)
4. abort              任何情况下都是终态
```

两张分类表移植自 pi，但**没有照抄它的判定顺序**。pi 是纯文本匹配，表里的 `"500"`、`"429"` 是裸子串，会把 `"max 500 tokens exceeded"` 判成可重试；本仓库手上有结构化的 `response.status`，所以状态码作主判据，文本表降为兜底。这条有测试锁住。

退避 `baseDelayMs * 2^(attempt-1)`，`maxDelayMs` 封顶，抖动上浮不超过 25%，等待期间响应 abort。

### `ai/responses.js` — 重写

- **重试**：整轮重试，包在「产生一条完整 assistant 消息」外面
- **截断**：读 `incomplete_details.reason`，区分 `max_output_tokens` 与 `content_filter`
- **断流**：加 `sawTerminal`，流跑完没见终结事件按错误处理，不再把半截内容当成功
- **`error` 事件**：补上原先没有的分支
- **`modelOptions`**：白名单透传，这一层不设默认值

### 事件与上层

`ai/events.js` 新增 `RETRY`。CLI 显示「重试 2/3」和「回复未完整」；Web / Desktop 在截断时落一条 `[incomplete]` 系统留痕，与既有的 `[stopped]` / `[error]` 同一套做法。

未认领的事件在 Web / Desktop 的 `emit` 里会安静落空（`else if (data.item)` 不成立），所以新增事件不破坏现有界面。

### `config.js` / `config.example.js`

```js
const WINDOWS = process.platform === 'win32';

bash: {
    executable: WINDOWS ? 'cmd.exe' : '/bin/zsh',
    args: WINDOWS ? ['/d', '/s', '/c'] : ['-lc'],
    // …
},
retry: { enabled: true, maxRetries: 3, baseDelayMs: 1_000, maxDelayMs: 30_000, retryAfterStream: false },
modelOptions: {},
```

`modelOptions` 留空表示完全交给服务端默认值。常用是 `reasoning: { effort }` 和 `max_output_tokens`——这两个通用。`store` / `service_tier` / `prompt_cache_key` 是 OpenAI 专有，第三方兼容网关可能忽略或直接 400，按实际接入的端点再定，所以不预置。

### 测试

`test/` 下四个文件，34 个用例，`npm test` 运行，零依赖（`node:test`）：

```text
files.test.js       10   $& 三种形态、CRLF 多行匹配、行数、read/edit 口径一致
retry.test.js        8   状态码优先、额度终态、"max 500 tokens" 不误伤、abort、退避封顶
responses.test.js   13   incomplete、断流、429 重试、400 不重试、已吐正文不重试、透传白名单
loop.test.js         3   端到端:模型 → edit 落盘 → 模型;截断与重试穿透 runAgent
```

`npm run check` 从 8 个文件扩到 **33 个**——原先恰好一个都没覆盖到出问题的地方。

## 两处设计取舍

**已吐出正文后断流，默认不重试。** 重试会让界面把同一段正文显示两遍。`retryAfterStream: false` 是默认值，这类失败直接报错交给用户。想换成「重试并由界面去重」的话打开这个开关，但界面得先支持重置流式缓冲。

**`reasoning_summary_text.delta` 分支保留。** 补上 `modelOptions` 后它不再是死分支——配 `reasoning: { summary: 'auto' }` 即可触发。同行的 `reasoning_text.delta` 本来就不是死的。

## 已知未做

**API Key 仍明文存在 `config.js`。** 本机会话日志里已有 11 处副本。该文件在 `.gitignore`、未进 git 历史，但任何读它的工具都会带走一份。本版按要求不改读取方式，**请自行轮换 Key**。

## 许可证

pi 是 **MIT，Copyright (c) 2025 Mario Zechner**。移植分类表属于使用其源码，需保留版权声明：

```js
// 故障分类表移植自 earendil-works/pi (MIT)
// https://github.com/earendil-works/pi/blob/main/packages/ai/src/utils/retry.ts
// Copyright (c) 2025 Mario Zechner. Licensed under the MIT License.
```

同时本仓库应尽快确定 LICENSE——当前「未声明」意味着默认保留所有权利。

## 明确不做

| | 理由 |
|---|---|
| 文件锁 | 那是 pi 为并行执行工具调用买的单。`ai/runner.js:9` 是 `for...of` 顺序执行，一次 run 内不存在该竞争 |
| 工具改成可注入 | CLI / Web / Desktop 共用同一套默认工具，`agent/index.js` 里硬编码是合适的 |
| 把 `compact.js` 拆出 `ai/` | 现在的位置对本仓库成立 |
| 引入 `@earendil-works/pi-ai` | 其 `types.ts` 是供应商中立的 Message 模型，而 `ai/` 原生构造 Responses items，接进来等于为已固定的协议做一次有损往返。只移植无状态工具函数，不引依赖 |
