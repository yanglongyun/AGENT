# 应用契约(SPEC)

app 是一个目录,里面是一个本地网站。宿主把它跑起来、摆进侧边栏、介绍给 agent。
本文是契约正典,一份三用:manifest 词汇表 = 生命周期 = 宿主能力表。
每个 app 自己的文档叫 `APP.md`(见「APP.md 怎么写」);本文是规范,不是某个 app 的文档。
(设计取舍与讨论记录见 `.dev/0.1.1/README.md`,本文只写定案。)

## 形态

**每个 app 是一个网站,有自己的 origin。** 这是契约的核心不变量;
「怎么成为网站」是一个执行策略位,有两种一等方式:

| 方式 | manifest | 谁应答 |
|---|---|---|
| 自运行 | 有 `run` | 宿主 spawn 你的进程,你自己应答整站 |
| 宿主代管 | 没有 `run` | 宿主内建的静态运行时替你应答(目录根即站点根) |

无论哪种,origin、取址、token、在宿主界面里的样子完全一致 —— 消费者无需区分。
沙箱宿主(workerd / 容器)是同一个策略位上的第三种执行方式,接口不变,app 无感。

```text
apps/<id>/
├── manifest.json    声明:是什么、怎么跑、要什么
├── APP.md           文档:数据表、API 表、什么时候用 —— 给模型读
├── icon.svg         可选。没有就用名字首字生成字母头像(也认 icon.png)
└── (实现)           随便什么语言、框架、构建方式 —— 契约不管
```

装 = 目录出现在 `apps/` 下;卸 = 删目录。

## manifest.json

```json
{
    "id": "memo",
    "name": "便签",
    "version": "0.1.0",
    "description": "记随手笔记。用户说「记一下」「笔记理一理」时用它。",
    "run": {
        "command": "node",
        "args": ["server.js"],
        "health": "/health",
        "mode": "on-demand"
    },
    "permissions": ["ai.complete"]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 与目录名一致,`[a-z0-9-]`,最长 32 |
| `name` | 是 | 显示名 |
| `version` | 否 | app 自己的语义化版本 |
| `contract` | 否 | 本契约的主版本,默认 `1`。宿主不认识的版本按无效处理,不猜 |
| `description` | 是 | 一句话说清是什么、什么时候用。**这行常驻 agent 提示词** |
| `run` | 否 | 没有 = 宿主代管的静态 app,见「宿主代管」一节 |
| `run.command` / `run.args` | 是 | 启动命令。`node` / `python3` / `./app` 都行 |
| `run.health` | 否 | 健康检查路径,默认 `/health`,HTTP 2xx 即算活 |
| `run.mode` | 否 | `on-demand`(默认):点开才起,闲了回收。`always`:随宿主启动,崩了重启,不回收 |
| `permissions` | 否 | 申请的宿主能力,见下。未声明的调用一律 403 |

原则:**manifest 只声明宿主必须知道的事实。** 排序、置顶、隐藏是用户偏好,归宿主存;
图标是文件约定;GUI 地址是运行时事实 —— 都不进 manifest。

## 生命周期(有 run 的 app)

宿主 spawn `command args...`,工作目录 = app 目录,注入环境变量:

| 变量 | 含义 |
|---|---|
| `PORT` | **必须监听它**。宿主现挑的空闲端口,重启会变 |
| `HOST` | **绑定这个地址**,由宿主指定(本机宿主给 `127.0.0.1`,容器等沙箱宿主给别的)。不要写死 loopback |
| `APP_ID` | 自己的 id |
| `APP_DATA_DIR` | 数据目录,宿主已建好。数据写这里,别写 app 目录 |
| `HOST_URL` | 宿主地址,调宿主能力用 |
| `APP_TOKEN` | 凭证,每次启动重发。放 `Authorization: Bearer`,别放 URL |

app 若有自己的同义变量(如 `XXX_PORT` / `XXX_DATA_DIR`):**宿主注入的优先**;
都缺省时保持独立产品的原行为不变。

约定(标准只写语义;等多久、重试几次这类数字全是宿主策略):

- **整站自己应答**:页面、静态资源、API 全部由你监听的端口出。GUI 在 `/` 上
- `run.args` **原样**传给进程:不经 shell,不做变量展开 —— 要用 PORT,在程序里读环境变量
- **health 是三态的**:
  连不上 = 还没起来,或已经死了;
  2xx = 就绪;
  其它 HTTP 应答(如 503)= 活着、正在初始化,宿主应继续等。
  慢启动因此有了合法的表达方式,不必祈祷宿主把超时常量调大。
  同步初始化的 app 一起来就是 2xx,自然只有两态 —— 中间态是给慢启动的,不是义务
- SIGTERM 后限时收尾;崩溃由宿主退避重启。
  原生只有后台常驻模式的既有项目,加一层转发 SIGTERM 的薄前台包装即可,不必改产品
- **状态只有一份真相,在你的 server 侧**:人经 GUI 改、agent 经 API 改,
  改的是同一份状态,而且**经 API 发生的变更必须反映到正在看的界面上**
  (SSE / WebSocket / 轮询随你)。GUI 只是状态的订阅者 ——
  这条是人机协同的地基:没有它,agent 改了文档而人看不见,协同就是背对背各改各的。
  **暂时做不到实时反映的,必须在 APP.md 里显著声明**(例如「改完请提醒用户手动刷新」)——
  让 agent 知道要替你补位,比假装有强
- `on-demand` 下,闲置的 app 可以被宿主回收,下次取址自动再起。
  **闲置怎么判是宿主策略,但回收前宿主必须先问一声**:再访问一次 health,
  应答 2xx 且 JSON 带 `"busy": true` 的,推迟回收。
  **「忙」包括占用中,不只是计算中**:有人开着页面(SSE / WebSocket 客户端连着)
  就算忙 —— 把已有的连接计数报进 busy 是最省事的实现。
  浏览器直连你的 origin,**宿主看不到那些流量**,busy 是你唯一的发言权;
  报不了 busy 的,就把状态落盘、随时可恢复

## 宿主代管(静态 app)

manifest 里**不写 `run`**,目录里有 `index.html`,就是一个完整的 app:

```text
apps/readme/
├── manifest.json    只有 id / name / description
├── index.html       站点根
└── (css / js / 图片随意)
```

- **同样有自己的真 origin**:`<link href="/style.css">` 这类根绝对路径照样成立
- **SPA 回落**:未命中的路径回落 `index.html`,前端路由天然可用
- **没有进程**:不参与启动 / 停止 / 崩溃重启 / 空闲回收,宿主界面也不显示这些操作
- **token 由宿主界面递进来**:被嵌进宿主时,宿主向 iframe `postMessage`
  一条 `{ type: "host.init", appId, token, hostUrl }`(targetOrigin 指定为你的 origin,
  不会漏给别人)。要收到它,`message` 监听必须在页面脚本的同步阶段就注册好。
  在独立标签页里打开时没有这条消息 —— 需要宿主能力就升级到自运行

什么时候升级到自运行:要存秘密(API key 不能进前端)、要后台跑、
要自建数据库 —— 加一个监听 PORT 的 server 即可,前端文件原样保留。

## 地址

端口每次启动都变,所以:**地址永远向宿主现问,不许缓存。**
宿主界面和 agent 通过宿主内部接口取址(取址时 app 没起会被顺手拉起)。
app 自己不需要取址 —— 自己的端口在 `PORT` 里;**查别的 app 的地址,没有这个能力**。

## 宿主的嵌入义务

宿主把 app 嵌进自己界面时,**不得阉割浏览器能力**:剪贴板读写、全屏、
指针锁定(画布拖拽要用)这些跨源 iframe 默认关闭的能力,宿主必须按 app 的
正常需要放开(`allow="clipboard-read; clipboard-write; fullscreen; pointer-lock"`)。
图片编辑器里 Ctrl+V 贴不进图,用户不会怪宿主,只会觉得 app 是坏的。

## 宿主能力

挂在 `{HOST_URL}/host/*`,带 `Authorization: Bearer {APP_TOKEN}`。
token 即身份,路径里没有 app id。manifest 没声明对应权限的,一律 403。

| 端点 | 权限 | 说明 |
|---|---|---|
| `GET /host/me` | 免声明 | `{ appId, name, version, permissions, theme }` |
| `POST /host/ai/complete` | `ai.complete` | `{ prompt, instructions?, title?, schema?, schemaName? }` → `{ text, usage }`。单次补全,无工具。`schema` 给 JSON Schema 即走协议原生的结构化输出;`title` 是这次调用在宿主「任务」里的标题 |
| `POST /host/ai/agent` | `ai.agent` | `{ prompt, workdir?, title? }` → SSE 事件流。完整 agent 轮次,带工具 |
| `POST /host/notify` | `notify` | `{ text, kind?: "toast"\|"badge" }`。宿主界面上提示 / 侧边栏角标 |

两个端点的每次调用都在宿主的「任务」里留一条记录(过程逐条落库,用户可回放)——
应用替用户干的活必须看得见。

`ai/agent` 的边界:轮次走宿主的审批门,按全局规则档判,**命中「要问」的直接拒绝**
(没人守着弹窗,不挂起)。工作目录默认 `APP_DATA_DIR`。
事件流的词表:`message` / `reasoning` / `function_call` / `function_call_output` / `done` / `error`。

宿主能力只有这些。文件、网络、进程你本来就有 —— 不需要宿主转手。

## APP.md 怎么写

读者是两个模型:**要用这个 app 的 agent** 和 **将来要改这个 app 的 AI**。必须包含:

1. **API 表**:agent 的官方接口 —— **HTTP 端点或 CLI 命令都是一等公民**,写清参数和返回。
   只给浏览器前端用的私有端点要注明「agent 别直接调」,否则 agent 照文档 curl 会翻车;
   agent 走 CLI 时要把 `APP_DATA_DIR` 等宿主变量透传给 CLI 子进程,否则读写的不是同一份数据
2. **什么时候用**:用户说什么话时该想到你
3. **数据**:表结构什么含义,存在哪
4. **怎么改**:构建命令(如果有),改了什么要同步更新本文档

协同型 app(文档、画布、表格这类人和 agent 会同时动手的)再加三条:

5. **当前状态端点**:当前打开的文档、选区、视口。人说「把这段改得正式点」时,
   agent 先问状态才知道「这段」是哪段 —— 没有它,协同退化成报坐标
6. **版本或撤销**:agent 直接改用户的东西,改坏了要能退回去 ——
   这是用户敢放手的前提,不是锦上添花
7. **危险标注**:不可逆的端点(清空、覆盖、批量删除)在 API 表里写明
   「此操作不可逆」。agent 读了标注,才知道哪一步该先请示

## 信任模型

**装一个 app = 以你的身份运行它的代码。** 权限声明管的是宿主能力,
不管 app 自己能干什么。`run.mode: "always"` 的 app 在你不看它时也在跑。
**宿主的权限系统看不见 app API 的语义**:agent 调你的接口,审批门看到的
只是一次 HTTP 请求,不知道那是「清空整个表格」。危险性由 APP.md 的危险标注
加 agent 的判断兜底 —— 这是现状,如实写在这里,不装作有更强的保证。

app 之间不互相嵌入(思维导图嵌进文档那类 OLE 场景不做):
跨 app 的内容流转由 agent 当胶水 —— 导出、转换、导入都是它的工具活。
这是取舍,不是疏漏。

同机的 app 彼此网络可达(都挂在 loopback 的端口上),origin 隔离只约束浏览器一侧 ——
**app 之间的隔离目前不作保证**。沙箱宿主(workerd / 容器)占的是「形态」一节里的
执行策略位:注入同一组环境变量、提供同一组 `/host/*` 端点,app 无感,
并可以在这个槽位上提供真正的 app 间边界。

## 稳定性分级与迭代

标准分版迭代,`contract` 字段是它的机制。分级的含义:

**已稳定** —— 依赖即承诺,在 contract 1 内永不破坏:

- 核心不变量:app = 有自己 origin 的网站;执行策略位(自运行 / 宿主代管)
- 环境变量五件套的名字与含义:`PORT` `HOST` `APP_DATA_DIR` `HOST_URL` `APP_TOKEN`
- 宿主能力的调用形状:`{HOST_URL}/host/*` + `Authorization: Bearer`(端点列表可增,形状不变)
- 生命周期语义:health 三态、busy 推迟回收、SIGTERM 收尾
- 地址纪律:现问不缓存;app 查不到别的 app
- `manifest.json` 现有字段的含义;新字段只增不改

**实验性** —— 语义可能调整,依赖需谨慎,变更会记录在 `.dev/`:

- `/host/notify` 的形状与 badge 语义(当前宿主把 badge 落成 toast)
- `/host/ai/agent` 的事件词表细节
- 宿主代管 app 的 `host.init` postMessage 递送
- 嵌入义务的能力清单(哪些 allow 必给,可能随浏览器演进增删)

**明确延期** —— 未定形,不要依赖,等真实需求出现再定(可加而不破坏存量,所以理直气壮后置):

- 远程 url 形态的 app(嵌入显示可以做,发 token 给远端运营者是另一个信任等级)
- 文件关联(「用 X 打开 ~/xxx.xlsx」)
- 沙箱宿主的参考实现
- 多用户隔离与宿主鉴权
- 分发、注册表、签名与信任分级
- app 间通信(现阶段 agent 就是胶水)

## 最小示例(零构建零依赖,全文如下)

`apps/hello/manifest.json`:

```json
{ "id": "hello", "name": "Hello", "description": "契约演示:最小的 app 长这样。",
  "run": { "command": "node", "args": ["server.js"] } }
```

`apps/hello/server.js`:

```js
import http from 'node:http';
http.createServer((req, res) => {
    if (req.url === '/health') { res.end('ok'); return; }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<h1>Hello</h1><p>我是一个 app。</p>');
}).listen(process.env.PORT, process.env.HOST || '127.0.0.1');
```

两个文件,就是一个完整的 app。
