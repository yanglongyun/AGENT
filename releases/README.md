# 发布包

`v1.0.0/` 包含不要求用户安装 Node.js 的可运行版本：

- `AgentChat-windows-x64.zip`：Windows 10/11 x64，解压后双击 `AgentChat.exe`。
- `AgentChat-macos-arm64.zip`：macOS 11+ Apple Silicon，解压后打开 `Agent Chat.app`。
- `SHA256SUMS.txt`：发布包 SHA-256 校验值。

校验示例：

```bash
cd releases/v1.0.0
shasum -a 256 -c SHA256SUMS.txt
```

发布包由 `npm run build:release` 生成。构建脚本会下载与当前构建环境版本一致的 Node.js 官方运行时，核对官方 SHA-256，然后注入已打包的应用与前端资源。
