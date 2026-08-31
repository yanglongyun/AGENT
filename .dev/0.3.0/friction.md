# 摩擦日志(只追加,不当场修)

来源:造 app / 用 app / 接入真实 app 时觉得别扭的地方。v2 从这里长,不从想象长。

## 接入五个真实仓库前,盘点阶段已知的

- 「装 = 目录出现」遇上构建:五个真实 app 都要 npm run setup,装的体验多了一步
- 契约写「app 的方法就是它的 HTTP API」,但五个真实 app 全用 CLI 驱动 agent ——
  该松成「HTTP API 或 CLI,写在 APP.md 里」
- 真实 app 自带后台化(bin start),与宿主管生死重叠
- 真实 app 用自家环境变量名(BOARD_PORT 等)和固定端口
