# 应用契约

app 是一个目录,里面是一个本地网站。宿主把它跑起来、摆进侧边栏、介绍给 agent。
本文是契约正典,一份三用:manifest 词汇表 = 生命周期 = 宿主能力表。
(设计取舍与讨论记录见 `.dev/0.2.0/README.md`,本文只写定案。)

## 形态

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
| `version` | 否 | 语义化版本 |
| `description` | 是 | 一句话说清是什么、什么时候用。**这行常驻 agent 提示词** |
| `run` | 否 | 没有 = 纯静态 app,宿主托管目录根的 index.html |
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
| `PORT` | **必须监听它**(127.0.0.1)。宿主现挑的空闲端口,重启会变 |
| `APP_ID` | 自己的 id |
| `APP_DATA_DIR` | 数据目录,宿主已建好。数据写这里,别写 app 目录 |
| `HOST_URL` | 宿主地址,调宿主能力用 |
| `APP_TOKEN` | 凭证,每次启动重发。放 `Authorization: Bearer`,别放 URL |

约定:

- **整站自己应答**:页面、静态资源、API 全部由你监听的端口出。GUI 在 `/` 上
- `health` 应答 2xx 才算启动成功;超时(默认 10s)按启动失败处理
- SIGTERM 后限时收尾;崩溃由宿主退避重启,连崩三次标记故障
- `on-demand` 下闲置会被回收(默认 10 分钟),下次访问自动再起 —— 别依赖进程常驻内存

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
宿主可以选择用沙箱(workerd / 容器)跑不受信的 app:注入同一组环境变量、
提供同一组 `/host/*` 端点,app 无感 —— 这是契约给沙箱留的接口位。

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
}).listen(process.env.PORT, '127.0.0.1');
```

两个文件,就是一个完整的 app。
