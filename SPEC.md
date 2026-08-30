# 应用契约(SPEC)

app 是一个目录,里面是一个本地网站。宿主把它跑起来、摆进侧边栏、介绍给 agent。
本文是契约正典,一份三用:manifest 词汇表 = 生命周期 = 宿主能力表。
每个 app 自己的文档叫 `APP.md`(见「APP.md 怎么写」);本文是规范,不是某个 app 的文档。
(设计取舍与讨论记录见 `.dev/0.2.0/README.md`,本文只写定案。)

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
    "id": "notes",
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

约定(标准只写语义;等多久、重试几次这类数字全是宿主策略):

- **整站自己应答**:页面、静态资源、API 全部由你监听的端口出。GUI 在 `/` 上
- `run.args` **原样**传给进程:不经 shell,不做变量展开 —— 要用 PORT,在程序里读环境变量
- **health 是三态的**:
  连不上 = 还没起来,或已经死了;
  2xx = 就绪;
  其它 HTTP 应答(如 503)= 活着、正在初始化,宿主应继续等。
  慢启动因此有了合法的表达方式,不必祈祷宿主把超时常量调大
- SIGTERM 后限时收尾;崩溃由宿主退避重启
- `on-demand` 下,闲置的 app 可以被宿主回收,下次取址自动再起。
  **闲置怎么判是宿主策略,但回收前宿主必须先问一声**:再访问一次 health,
  应答 2xx 且 JSON 带 `"busy": true` 的,推迟回收。
  注意:浏览器直连你的 origin,**宿主未必看得到你的流量** ——
  长任务要么在 health 里应答 busy,要么把状态落盘、随时可恢复

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

## 宿主能力

挂在 `{HOST_URL}/host/*`,带 `Authorization: Bearer {APP_TOKEN}`。
token 即身份,路径里没有 app id。manifest 没声明对应权限的,一律 403。

| 端点 | 权限 | 说明 |
|---|---|---|
| `GET /host/me` | 免声明 | `{ appId, name, version, permissions, theme }` |
| `POST /host/ai/complete` | `ai.complete` | `{ prompt, instructions? }` → `{ text, usage }`。单次补全,无工具 |
| `POST /host/ai/agent` | `ai.agent` | `{ prompt, workdir? }` → SSE 事件流。完整 agent 轮次,带工具 |
| `POST /host/notify` | `notify` | `{ text, kind?: "toast"\|"badge" }`。宿主界面上提示 / 侧边栏角标 |

`ai/agent` 的边界:轮次走宿主的审批门,按全局规则档判,**命中「要问」的直接拒绝**
(没人守着弹窗,不挂起)。工作目录默认 `APP_DATA_DIR`。
事件流的词表:`message` / `reasoning` / `function_call` / `function_call_output` / `done` / `error`。

宿主能力只有这些。文件、网络、进程你本来就有 —— 不需要宿主转手。

## APP.md 怎么写

读者是两个模型:**要用这个 app 的 agent** 和 **将来要改这个 app 的 AI**。必须包含:

1. **API 表**:方法、路径、参数、返回 —— agent 照这个表 curl 你
2. **什么时候用**:用户说什么话时该想到你
3. **数据**:表结构什么含义,存在哪
4. **怎么改**:构建命令(如果有),改了什么要同步更新本文档

## 信任模型

**装一个 app = 以你的身份运行它的代码。** 权限声明管的是宿主能力,
不管 app 自己能干什么。`run.mode: "always"` 的 app 在你不看它时也在跑。
同机的 app 彼此网络可达(都挂在 loopback 的端口上),origin 隔离只约束浏览器一侧 ——
**app 之间的隔离目前不作保证**。沙箱宿主(workerd / 容器)占的是「形态」一节里的
执行策略位:注入同一组环境变量、提供同一组 `/host/*` 端点,app 无感,
并可以在这个槽位上提供真正的 app 间边界。

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
