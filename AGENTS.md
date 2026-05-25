# AGENT

`agent-kernel` 实验仓。

- origin: `https://github.com/valueriver/AGENT.git`
- ESM (`type: "module"`)，TypeScript 源码，私有包。
- SQLite 使用 Node 内置 `node:sqlite`。
- 前端使用 React + Tailwind + TypeScript。

## 命令

```bash
npm run start       # tsx ./index.ts
npm run server      # tsx ./server/index.ts
npm run cli         # tsx ./cli/index.ts
npm run gui         # tsx ./gui/start.ts
npm run typecheck   # tsc --noEmit
cd gui && npm run build
```

`package.json` 未声明 `engines.node`，也没有显式端口配置；如需端口请看 `gui/start.js` / `index.js` 内部。

## 注意

- 包含本地数据库、`node_modules`、运行日志；提交前查 `.gitignore` 和 `git status`，不要把运行态数据提交。
