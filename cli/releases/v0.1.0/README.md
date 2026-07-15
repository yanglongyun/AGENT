# Agent CLI v0.1.0

选择对应文件：

- `agent-macos-arm64`：Apple Silicon Mac
- `agent-macos-x64`：Intel Mac
- `agent-linux-arm64`：Linux ARM64，静态链接
- `agent-linux-x64`：Linux x86_64，静态链接
- `agent-windows-x64.exe`：Windows 10/11 x64

把 `.env.example` 复制为 `.env`，填入 API Key。`.env` 与可执行文件放在同一目录即可。

macOS / Linux：

```bash
chmod +x agent-macos-arm64
./agent-macos-arm64
```

Windows PowerShell：

```powershell
.\agent-windows-x64.exe
```

程序默认把会话数据库保存到用户目录下的 `.agent-cli/agent.db`。Shell 工具直接执行本机命令，没有沙箱。

校验文件：

```bash
shasum -a 256 -c SHA256SUMS.txt
```
