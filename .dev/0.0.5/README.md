# 0.0.5 — Desktop 与 GUI 设置

这一版在独立 Web 产品之外增加 Electron 桌面产品形态。

```text
desktop/
├── main/       Electron 主进程与安全 preload
├── server/     Desktop 独立的本地服务
├── shared/     Desktop 前后端事件协议
└── ui/         Desktop 独立 React UI
```

Desktop 继续调用仓库唯一的 `agent → ai`，不会复制 Agent 内核。外层 `web` 仍可独立部署，两种产品可以分别演进。

完整产品关系：

```text
CLI ───────────────→ agent → ai
web/server + web/ui → agent → ai
desktop/* ─────────→ agent → ai
```

`ai` 和 `agent` 保持宿主无关；构建 Desktop 时由 Electron Builder 自动收入应用包。

## 本地化能力

- Electron 使用随机回环端口，不占用 Web 的 9510。
- SQLite 和剪贴板图片副本存入 Electron `userData`。
- 原生文件选择和拖拽直接引用绝对路径，不上传、不复制。
- 剪贴板图片没有稳定路径时，继续保存为受管附件。
- 工作目录可通过系统目录选择器设置。
- preload 开启上下文隔离，只暴露必要的原生桥接。
- 使用操作系统原生标题栏，macOS 与 Windows 的窗口按钮均由系统管理。
- Desktop 数据与 Web 数据互不混用，可以独立发版和演进。

## 附件

- Web 支持选择、拖拽以及粘贴图片；浏览器附件保存到受管目录。
- Desktop 选择或拖拽文件时直接保存原始绝对路径，不上传、不复制。
- Desktop 粘贴截图时因为剪贴板内容没有稳定路径，保存到 `userData/files`。
- 图片只在请求 Responses API 时临时转换成 `input_image`，数据库不保存 Base64。
- 普通文件以本地路径交给 Agent，再由 `read` 工具按需读取。

## GUI 设置

Web 与 Desktop 的侧边栏左下角统一为设置入口。设置是主内容区中的完整页面，不是弹窗。

可配置内容：

- Responses API 地址
- API Key
- 模型 ID
- 系统提示词
- 界面主题

前四项保存在各自 SQLite 的 KV 表中：

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

每次启动 Agent 时从数据库读取一次设置快照，运行中的任务不会被中途修改影响。Web 和 Desktop 的 GUI 不从环境变量或配置文件读取模型、API Key、Responses 地址及提示词。主题属于纯 UI 偏好，保存在浏览器本地存储。

端口、数据库位置、工具超时和上下文压缩阈值仍属于程序级参数，不属于用户模型设置。

## 命令

```bash
npm run desktop
npm run desktop:pack
npm run desktop:dist
```

安装包包含 `ai`、`agent`、`desktop` 和已构建 UI；可部署版 `web` 不进入安装包。

Web 开发启动：

```bash
npm run web:build
npm run web
```

首次使用 Web 或 Desktop，需要在设置页面填写模型连接信息。
