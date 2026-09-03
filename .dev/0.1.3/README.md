# 0.1.3 — 底层清晰化:架构

这个项目的核心不是功能,是**让人把 agent 的底层看清楚**。0.1.2 之后代码在变混乱:
两套协议驱动、六个文件拼一个循环。这一版不加东西,只做减法,每砍一刀都先讨论再动手。
这份文档记 ai / agent 两层的调整;看清楚之后引出的权限重做,在 0.1.4。

## 一、ai 层只认 Responses API

**砍掉 Chat Completions 驱动。** 之前 `ai/drivers/` 下有 responses 和 chat 两个驱动,
外加一个登记处 `drivers/index.js`,`request.js` 按名字派发。两个驱动之间零依赖,
各自消化协议怪癖,设计上没错;但"多支持一种协议"不是这个项目的目标,
它带来的是一层间接(driver 参数从 UI 一路穿到 ai)和一份 302 行的翻译代码。

砍完的 `ai/`:

```text
index.js      入口,只做导出
request.js    一次请求 = attempt + 重试
responses.js  发请求、读 SSE 流、解析成 { items, usage, status, stopReason }
retry.js      哪些错误值得再试、退避多久
complete.js   无工具的单次补全
```

`driver` 这个概念随之从 settings、UI 设置页、runs / compile / bridge 的 runtime 组装、
agent/compact 全部抹掉。settings 表里的 `driver` 行直接删,不做兼容。

## 二、循环搬回 agent 层

README 一直写着"ai 不知道有工具"。这句话是假的:`ai/loop.js` 认识 `function_call`、
握着 executors Map,`ai/runner.js` 直接 `await execute()`。ai 层不知道的只是"有哪些工具"。

两种能自洽的切法:

- **ai 是纯协议客户端**,循环和工具执行归 agent。"模型 → 工具 → 模型"这个定义 agent 的动作
  住在叫 agent 的目录里。
- **ai 是通用内核**,承认循环在 ai,agent 目录改名成 coding 之类,表示它只是内核的一份装配。

选了前者。理由:agent 的本质就是那个循环,113 行。它放在 ai 里意味着打开 agent 目录
看不到 agent 是什么,只能看到它用了哪些工具。"内核"这种抽象在只有一个消费者时是多余的。

搬完,README 那句话变成真的。

## 三、合成一个文件,看清楚

搬过去之后,agent 层是六个文件:index 装配 Map、permission 把 Map 里每个函数包一层闭包、
loop 把包好的 Map 传给 runner、runner 按名字取、danger 把命令解析成动作、rules 做三维匹配。
一次工具调用穿六层,审批藏在闭包里,读 runner 看不到"这里会拦"。

先把六个文件**全部并进 `agent.js`**,按阅读顺序排成六段:词表、认识调用、规则、审批门、
工具表、循环。361 行,从上往下就是完整的拦截链。这一步的目的不是留着,是**看清楚**。

看清楚之后的反应是:"完全出乎我的预料,我想象的是设一条规则,传进来,直接正则匹配,
怎么会这么复杂,还有各种词表?" —— 这句话开启了 0.1.4。

## 四、拆回去

权限重做完(见 0.1.4),agent 层只剩循环和工具,再按职责拆开:

```text
index.js      循环:请求 → 有 function_call 就交给 runner → 再请求。给了 ask 才把 confirm 发给模型
runner.js     执行一次 function_call
tools.js      五个工具的 schema,confirm 也在这张表里
compact.js    上下文压缩
functions/    bash / read / write / edit / confirm 的实现
```

`index.js` 84 行。`createRunner()` 只返回 `run`,给模型看的工具定义由 index.js 自己从 tools.js 拿,
不从 runner 转手。confirm 的 schema 从 `functions/confirm.js` 搬进 tools.js,
functions/ 下的文件都只剩执行逻辑。

## 五、顺手清掉的

- **CLI 删掉。** 它没有 store,规则进不了它的提示词,和 Web 端的行为已经分叉。
- **config 收拢。** 顶部四个只有 CLI 读的字段删掉;`config.client` 这层嵌套拍平 ——
  它是为多个客户端并列准备的,现在只剩一个,桶名不再表达任何东西。
- **runs.js 组装 runtime 不再 `...config` 整包展开**,只列 runAgent 要的字段。
- **`ai/events.js` 删掉。** emit 的事件名就是 item 的 type 加上 retry / done / error,
  runs.js 本来就在按字面量比;一张常量表只是给字面量起了别名。
- 本地库的 conversations 表还是旧列名 `consult`,新代码要 `confirm`,服务起不来。
  兼容迁移已经在上一版删掉,所以直接改列名,这是这次改动负责人的事,不是代码的事。
  settings 表里残留的 `consult=on` 一并删掉。
