# 摩擦日志(只追加,不当场修)

来源:造 app / 用 app / 接入真实 app 时觉得别扭的地方。v2 从这里长,不从想象长。

## 接入五个真实仓库前,盘点阶段已知的

- 「装 = 目录出现」遇上构建:五个真实 app 都要 npm run setup,装的体验多了一步
- 契约写「app 的方法就是它的 HTTP API」,但五个真实 app 全用 CLI 驱动 agent ——
  该松成「HTTP API 或 CLI,写在 APP.md 里」
- 真实 app 自带后台化(bin start),与宿主管生死重叠
- 真实 app 用自家环境变量名(BOARD_PORT 等)和固定端口

## 五个真实仓库接入(五路 Sonnet 并发,每路独立报告,已去重归类)

### 契约文字要动的

- **busy 的语义偏「计算中」,真实场景全是「占用中」**。notes(WS 协同挂着)、board(SSE)、
  ramify 都撞到「有人开着页面但没有长任务」;canvas 给出了参考答案 ——
  busy = 是否有 SSE 客户端连着,复用既有信号。SPEC 该照这个改文字并举协同例
- **agent 的官方接口可以是 CLI,契约默认 HTTP curl**。mindmap 的 HTTP 端点是浏览器私有
  实现(直接 curl 会撞 Unsupported query),五个 app 全以 CLI 为主接口。
  连带问题:CLI 场景下宿主环境变量(APP_DATA_DIR)要不要/怎么透传,契约没写(canvas)
- **HOST 的信任边界没有着落**(notes):契约要求不写死 loopback,但无鉴权 app 的
  安全模型恰恰依赖 loopback。宿主误传 0.0.0.0 时责任在契约文本里是空的
- **宿主变量与 app 自有同义变量(RAMIFY_DATA_DIR 等)谁优先,契约没明文**(ramify):
  五路都按「宿主优先」实现了,该升格为条款
- **「界面必须反映 API 变更」是已稳定条款,mindmap 完全做不到**:没有推送机制,
  agent 改完用户看不见。契约缺「协同能力不足时怎么诚实降级声明」的位置 ——
  落差只能塞 APP.md 文字,宿主与 agent 无结构化感知
- **协同三件套(状态端点/版本/撤销)五个 app 全缺或大缺**:两路独立追问
  「如实写缺口算不算满足契约」。要给答案:算,但可能需要结构化标注

### 宿主/生命周期要接的

- **安装≠可跑**(notes):构建产物被各仓库 gitignore,clone 后没跑 setup,
  health 永远不通,宿主只会退避重启,诊断不出「缺一次 npm install」
- **单例残留 pid 假启动**(board):runtime.json 里旧 pid 若还活着,start 直接复用
  旧地址、不听新 PORT —— CLI 单例心智与「端口每次现分配」相撞;异常崩溃后会复现
- **运行时版本没处声明**(board):node>=22.5 硬依赖,版本不对=启动即崩,
  无结构化表达,manifest 或可加 engines 类字段
- **前台入口的兜底范式**(canvas):这次五个都恰好有 --foreground;契约该写
  「原生只有后台模式时,加一层转发 SIGTERM 的薄包装」
- **工作目录=app 目录,对依赖 process.cwd() 的既有项目是隐性迁移成本**(ramify,已修其一)
- **health 三态对同步初始化的 app 退化为两态**(ramify):文字该说明中间态非强制

### 生态层面的

- **skill 与 app 双身份 → 数据分裂**(mindmap):/mindmap 技能写 OS 固定目录,
  app 形态写 APP_DATA_DIR,两套数据互不相通且无提示。契约未讨论过双身份
- **APP.md 与 SKILL.md 大量重叠,防漂移只靠人工纪律**(board)
- **AI 写的 APP.md 也会漂**(集成时实测):board 文档写返回 { card },实际返回裸对象
- **description 的「一句话」无可操作标准**(board):全靠手感
- **SPEC 示例与真实项目撞名**(notes):已修 —— 示范 app 改名 memo
