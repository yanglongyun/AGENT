# 便签

记随手笔记,按时间倒序列出。数据在自己的 SQLite 里,和宿主无关。
本 app 是契约示范:单文件 server、零构建、零依赖、自服务整站。

## 什么时候用

用户说「记一下」「刚才记了什么」「把笔记理一理」时,可以直接调下面的 API,
或告诉用户侧边栏里有这个应用。

## API

先取址(`GET {宿主}/api/apps/memo/address` → `{ origin }`),再对 origin 调:

```text
GET    /health           健康检查
GET    /api/notes        列出全部,按 id 倒序 → { notes: [{id,text,created_at}] }
POST   /api/notes        {"text":"..."} 新建 → { note }
DELETE /api/notes/:id    删除一条 → { deleted }
```

## 数据

`$APP_DATA_DIR/notes.db`,表 `notes`:`id` 自增主键、`text` 正文(≤4000 字)、`created_at` ISO 时间。

## 怎么改

全部实现在 `server.js` 一个文件里(后端 + 内嵌页面),改完无需构建,
下次打开即生效(进程被回收后自动用新代码重启)。改了表结构或 API,同步更新本文档。
