# 便签

随手记一条文字,按时间倒序列出来。数据在自己的 SQLite 里,和宿主的库无关。

## 数据

库文件位于 `APP_DATA_DIR/notes.db`(路径由宿主通过环境变量给出,app 不自己决定)。

表 `notes`:

| 列 | 含义 |
|---|---|
| `id` | 自增主键 |
| `text` | 笔记正文,最长 4000 字 |
| `created_at` | ISO 时间戳 |

## 接口

后端只认这几条,前缀 `/api` 由宿主反代过来:

```text
GET    /health           健康检查,宿主用它判断启动成功
GET    /api/notes        列出全部,按 id 倒序
POST   /api/notes        {"text": "..."} 新建
DELETE /api/notes/:id    删除一条
```

## 宿主能力

用了 `ai.complete`(已在 manifest.permissions 里声明)。前端把所有笔记拼成一段
提示词发给 `host/ai/complete`,让模型归纳要点。

凭证不写在代码里:页面加载后向父窗口发 `os.ready`,宿主回 `os.init` 带上 token,
之后调 `host/*` 时放进 `Authorization: Bearer`。

## 什么时候提到它

用户说「记一下」「刚才记了什么」「把笔记理一理」时,告诉他侧边栏里有这个应用。

## 怎么改它

源码在 `src/`,是三个纯文件,没有依赖。**改完必须构建**:

```bash
npm run build --prefix apps/notes
```

构建就是把 `src/app.css` 和 `src/app.js` 内联进 `src/index.html`,产出
`dist/index.html`。宿主只认 dist,不构建的话页面不会变。

改了表结构要同步更新本文件上面的「数据」一节 —— 下一个来改这个 app 的人(或 AI)
只有这份文件可看。
