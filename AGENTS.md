# AGENT

`agent-kernel` 实验仓。

- origin: `https://github.com/valueriver/AGENT.git`
- ESM (`type: "module"`)，私有包。

## 命令

```bash
npm run start   # node ./index.js
npm run cli     # node ./cli/index.js repl
npm run gui     # node ./gui/start.js
```

`package.json` 未声明 `engines.node`，也没有显式端口配置；如需端口请看 `gui/start.js` / `index.js` 内部。

## 注意

- 包含本地数据库、`node_modules`、运行日志；提交前查 `.gitignore` 和 `git status`，不要把运行态数据提交。
