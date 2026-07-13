# 贡献指南

感谢你对 Agent Chat 的关注。提交贡献即表示你同意以项目的 MIT License 发布该贡献。

## 开始之前

- Bug 和小型改进可直接提交 Issue 或 Pull Request。
- 较大功能、架构变更或兼容性破坏，请先创建 Issue 讨论。
- 安全漏洞不要公开报告，请按 [SECURITY.md](SECURITY.md) 处理。

## 本地开发

需要 Node.js 22 或更高版本。

```bash
npm install
cp .env.example .env
npm run server
npm run ui
```

## 提交变更

1. 从 `main` 创建主题分支。
2. 一次提交专注于一个问题，保持代码与现有风格一致。
3. 不要提交 `.env`、API Key、数据库、上传文件或其他私密数据。
4. 提交前运行：

```bash
npm run check
npm run build
```

5. Pull Request 中说明变更原因、验证方式和用户可见影响；UI 变更建议附截图。

## 代码与文档

- 优先使用清晰的小模块，避免不必要的依赖。
- 新增配置项时同步更新 `.env.example` 和 README。
- 新增或改变用户可见行为时，在 `CHANGELOG.md` 的 `Unreleased` 下记录。
- 尊重第三方软件的许可证、商标和归属要求。
