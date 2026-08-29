# 0.2.0 — 应用契约:标准化

0.0.8 做出了应用宿主,0.1.0 把它并进单一客户端。这一版回答一个更大的问题:
**app 到底是什么** —— 把它从「我们产品的一个功能」提升为「一份别人也能实现的契约」。

对标是 Skills 和 MCP,不是 Raycast 扩展:Skills 定义了「模型怎么获得技能」,
MCP 定义了「模型怎么接工具」,都停在契约层,不锁任何运行时。
我们要定义的是:**AI 时代的 GUI 应用长什么样,以及 agent 怎么使用它。**

## 一、立场:标准停在契约层

曾认真评估过把应用统一跑在 workerd 上(见 Triforge 的 workerd 路线沉淀:
isolate 隔离、物理断网、D1 binding,整条路已验证)。结论是**不采用为标准地基**:

> 想成为标准,就不能依赖某个具体运行时。Node、Python、Go、workerd 都该能实现这份契约。
> workerd 降级为「宿主可选的一种沙箱实现」—— 契约留出接口位,不写进正文。

那份沉淀的价值不在运行时选型,在坑:每应用一个真 origin(坑 A)、
宿主能力与挂载方式正交(坑 F)、数据和代码做邻居(坑 B)。
这些以协议语言写进本契约,而不是以 workerd 的语言。

## 二、契约:五件事,其余留白

```text
1. 形态    app = 一个目录:manifest.json + APP.md + 实现(随便什么语言/框架)
2. 生命    宿主 spawn command,注入 PORT / APP_ID / APP_DATA_DIR / HOST_URL / APP_TOKEN;
           /health 应答算活;SIGTERM 收走;崩溃退避重启
3. GUI     app 是一个本地网站:自己监听 PORT,自己应答自己的页面和 API,GUI 在 / 上
4. Agent   app 的方法就是它的 HTTP API,写在 APP.md 里;agent 读文档、发 HTTP
5. 宿主能力 {HOST_URL}/host/* + APP_TOKEN,与挂载方式无关(iframe / 独立标签页 / curl 全一样)
```

**留白同样是契约的一部分**:语言、框架、构建方式、沙箱与否 —— 全是宿主和作者的自由。
留白的底气来自第 3 条和第 5 条:app 自己服务自己,能力走 HTTP,
于是它对宿主的全部认知被压缩到两个环境变量:`HOST_URL` + `APP_TOKEN`。

### app = 本地网站,这一条推翻现状的一处

0.1.0 的现状:宿主托管 `dist/` + 路径前缀 `/apps/:id/` 反代 —— app 被拆成两半。
这正是 workerd 沉淀里坑 A 的形态:AI 写出 `fetch('/api/notes')` 这种**最自然的
绝对路径**,当场 404。notes 靠相对路径侥幸活着。

0.2.0 改为:**每个 app 一个真 origin,无例外。**

- 有 `run` 的 app:自己监听宿主分配的 PORT,自己应答整站,iframe 直连 `http://127.0.0.1:<port>`
- 纯静态 app(无 `run`):宿主也给它开一个极小的静态服务端口 ——
  否则它写 `<link href="/style.css">` 一样炸,坑 A 对静态 app 同样成立

真 origin 带来的副产品:不同端口 = 不同 origin,localStorage 天然互不可见;
原来靠 opaque origin 补偿的隔离,现在由真 origin 直接提供,反代整个删除。

## 三、manifest.json 词汇表

先立筛选原则,它和第五节宿主 API 那条对仗:

> **manifest 只声明宿主必须知道的事实;凡是用户偏好或界面表现,一律不进 manifest。**
> manifest 是自我描述,不是自我推销。

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

六个字段,每个都在回答「这是什么、怎么跑、要什么」;
没有一个在回答「把我摆在哪、画成什么样」。纯静态 app 再去掉 `run`。

| 字段 | 说明 |
|---|---|
| `id` | 与目录名一致,`[a-z0-9-]` |
| `description` | **唯一常驻提示词的字段**。agent 靠它决定什么时候提到这个 app |
| `run.command/args` | 随便什么:`node` / `python3` / `./app` —— 运行时无关就体现在这里 |
| `run.health` | 健康检查路径,应答即算活 |
| `run.mode` | `on-demand`(默认):点开才起,闲了回收。`always`:随宿主启动,崩了重启,不回收 |
| `permissions` | 申请的宿主能力。未声明的调用直接 403 |

### 被讨论掉的四个字段(记下为什么,防止回潮)

- **`entry`** — app 是网站,GUI 就在它 origin 的 `/` 上,这本身是约定,不需要字段。
  首页想放别处,它自己 302 —— 它是网站,它有这个能力。
- **`server` → `run`** — `server` 是实现者视角(「我有个服务端」),
  `run` 是宿主视角(「怎么把它跑起来」)。manifest 的读者是宿主,用宿主的词。
- **`sidebar.order / hidden`** — 让 app 自报排序,就是邀请所有 app 都填最小值,
  和「description 写得越夸张越容易被调用」是同一类腐化。
  排序、置顶、隐藏全是用户偏好,归宿主存,不归 app 声明。
- **`icon`(emoji)** — 不规范。改为文件约定:目录根放 `icon.svg` / `icon.png`,
  有就用,没有就用名字首字生成字母头像。约定优于字段。

### `run.mode` 为什么是枚举不是两个布尔

「何时启动」和「要不要回收」实际是同一个决定。拆成 `autostart` + `keepAlive`
会出现「开机启动但闲了被回收」这种自相矛盾的组合 —— 枚举把矛盾掐死在词汇表里。

`always` 意味着**用户没打开任何东西,这个 app 的代码就在跑**。
它必须在侧边栏上可见(常驻标记),和权限声明同一个性质:明文即知情同意。

## 四、取址:地址是运行时事实,宿主给

端口是宿主 spawn 时现挑的空闲端口,重启就变 —— 它天生进不了 manifest,
只能活在宿主的注册表里,谁要用谁来问。

### 宿主的两张脸

```text
/api/*      产品内部面    给自己的 UI 和自己的 agent 用;无 token,不进标准
/host/*     app 契约面    给 app 用,凭 APP_TOKEN 认身份;进标准,动它就是动契约
```

取址接口在**内部面**上:

```text
GET /api/apps/:id/address  →  { "origin": "http://127.0.0.1:54321", "status": "ready" }
```

宿主收到请求时:app 没起就拉起(懒启动的触发点),等健康检查过,返回 origin。
iframe 拿它填 src,agent 拿它调 API —— 一个接口,两个消费者。

进标准的不是这个路径,而是一条**宿主义务**:

> 宿主必须为它的 agent 和界面提供 app 取址能力。路径怎么定是各家实现的自由。

三条纪律:

1. **地址永远现问,不许缓存。** UI 每次打开重新取,agent 每轮用之前重新取,谁缓存谁 502。
2. **清单里不注入端口数字,只注入取址约定。** 端口会过期,约定不会。
3. **app 查不到别的 app 的地址。** 自己的端口在 PORT 里,宿主在 HOST_URL 里;
   查别人 = app 间通信,明确不做(真要做也经宿主中转,不让 app 互相发现)。

## 五、宿主 API:一条原则筛出四个端点

app 是本地进程,没有沙箱,**文件、网络、进程它本来就有** —— 宿主转手一遍毫无意义。所以:

> **宿主 API 只提供 app 自己拿不到的东西:模型、agent、产品界面。**

挂在 `{HOST_URL}/host/*`,`Authorization: Bearer {APP_TOKEN}`。
路径里没有 app id —— token 本来就绑定身份,`:id` 是冗余。

| 端点 | 权限 | 作用 |
|---|---|---|
| `GET /host/me` | 免声明 | 身份、已授权限、主题 |
| `POST /host/ai/complete` | `ai.complete` | 单次补全,无工具 |
| `POST /host/ai/agent` | `ai.agent` | 完整 agent 轮次:带工具,SSE 流式吐事件 |
| `POST /host/notify` | `notify` | 宿主界面上的 toast / 侧边栏角标 |

被原则筛掉的:storage(app 有自己的 `APP_DATA_DIR`)、fs / fetch(它本来就有)、
读用户对话(隐私,且没有正当场景)。

### `ai.agent` 的两个语义决定

**权限怎么过**:app 触发的轮次走同一道审批门 —— 否则权限系统又被绕过一次。
但这种轮次旁边未必有人守着弹窗,所以:**按全局规则档判,命中「要问」的直接当拒绝**,
与后台任务同款(没人可问就拒绝,绝不挂起)。app 收到明确失败,而不是卡死五分钟。

**工作目录**:默认 `APP_DATA_DIR`,可指定别处。这不是提权 ——
app 本来就能碰整台机器 —— 只是让被拦下的操作有清晰的审计痕迹。

### `notify` 是坑 F 的正解验证

宿主 UI 能力做成 **app 后端可调的 HTTP 端点**,不是 iframe 里的 postMessage 对象。
app 无论嵌在侧边栏、开在独立标签页、还是被脚本调,能力完全一致。
v1 只做 toast 和角标两种,别贪。

## 六、agent 怎么使用 app

不发明新机制。agent 手里有 `bash`:先 curl 内部面取址,再 curl app 的 API。

```text
常驻   每个 app 的 description 一行 + 取址约定,拼成清单进 instructions
按需   agent 用 read 读 APP.md —— 接口表就写在里面
```

**文档即 SDK,读了就能调。** 这与 Skills 的 progressive disclosure 同构。
等真出现高频调用再考虑专门的 `app` 工具,现在加是过度设计。

APP.md 因此有双重读者:**要改这个 app 的 AI**(数据表、构建方式)和
**要用这个 app 的 agent**(API 表、什么时候用)。两者都是模型,一份文档服务两个时刻。

## 七、信任模型:白纸黑字

不强制沙箱,就意味着:**装一个 app = 以你的身份运行它的代码。**

这不丢人 —— Skills、npm、VS Code 扩展全都如此 —— 但必须写明,不许含糊:

- 权限声明(`permissions`)管的是**宿主能力**,不管 app 自己能干什么
- `run.mode: "always"` 的 app 在你不看它时也在跑
- 宿主可以选择用 workerd / 容器跑不受信的 app —— 契约留出这个接口位:
  沙箱化的宿主照样注入同一组环境变量、提供同一组 `/host/*` 端点,app 无感

## 八、v2 候选(列出来防漂移,现在不做)

- `conversations.open`:app 里一键「就这条开个对话」—— 要宿主界面配合跳转
- 宿主 → app 的事件推送(主题切换等);现在靠 app 轮询 `/me`,够用
- app 触发的 agent 轮次,审批卡上浮到界面,让守在旁边的用户实时放行
- 专门的 `app` 调用工具(等 bash+curl 被证明不够再说)

## 九、实施清单

1. 仓库级 `APP.md`:契约正典,一份三用(manifest 词汇表 = 生命周期 = 宿主能力表)
2. supervisor:`run.mode: "always"` 启动组;静态 app 的每 app 静态端口;删反代
3. `/api/apps/:id/address` 取址接口;iframe 改为直连 origin
4. bridge:迁到 `/host/*`(token 认身份,路径去 `:id`);补 `ai/agent`(SSE)与 `notify`
5. `promptSection()`:注入取址约定与 APP.md 指引
6. notes 重写:自服务整站、零构建、零依赖、`icon.svg` —— 成为契约示范
7. 侧边栏:图标改文件约定 + 字母头像;排序存宿主库(用户偏好)

## 十、验收清单

- [ ] `<link href="/x.css">` 根绝对路径能加载(坑 A 的死处,必须过浏览器,curl 测不出)
- [ ] `fetch('/api/...')` 绝对路径能通
- [ ] 静态 app(无 run)同样有自己的 origin,绝对路径同样成立
- [ ] app A 拿不到 app B 的数据(origin 隔离 + token 各异),也查不到 B 的地址
- [ ] 未声明的权限被 403
- [ ] `run.mode: "always"` 随宿主启动,崩溃重启,不被空闲回收;侧边栏可见常驻标记
- [ ] `run.mode: "on-demand"` 懒启动、闲时回收,再点开又活(地址现问,不缓存)
- [ ] app 触发的 agent 轮次,命中规则的操作被拒绝而非挂起
- [ ] notify 在 iframe 内、独立标签页、curl 三种来源下行为一致
- [ ] python3 写一个 app,证明运行时无关不是口号
- [ ] AI 从零造一个 app 并跑通
