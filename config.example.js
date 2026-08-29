// Windows 上没有 /bin/zsh，用 cmd.exe;其余平台保持原样。
const WINDOWS = process.platform === 'win32';

export default {
    // 'responses' = OpenAI Responses API;'chat' = Chat Completions(GLM 等只有这个)。
    // 两个驱动在 ai/drivers/ 下彼此独立,循环和工具执行是共用的。
    driver: 'responses',
    responsesUrl: 'https://api.openai.com/v1/responses',
    apiKey: '',
    model: '',
    instructions: '你是一个编程 Agent。调用工具前用 summary 简短说明目的。',
    workdir: process.cwd(),
    maxRounds: 32,
    errorMaxChars: 4000,
    // 上游抖动时的重试。判定顺序:额度/账单(终态) → HTTP 状态码 → 错误文本兜底。
    retry: {
        enabled: true,
        maxRetries: 3,
        baseDelayMs: 1_000,
        maxDelayMs: 30_000,
        // 流已吐出内容后再断,重试会重复一遍正文。默认关。
        retryAfterStream: false,
    },
    // 透传给 Responses 请求体的模型参数。这里留空表示完全交给服务端默认值。
    // 常用:reasoning: { effort: 'medium' }、max_output_tokens: 8_000。
    // store / service_tier / prompt_cache_key 是 OpenAI 专有,第三方网关可能忽略或报 400。
    modelOptions: {},
    compaction: {
        contextWindowTokens: 128_000,
        foldRatio: 0.8,
        tailKeepChars: 40_000,
        summaryMinChars: 80,
        callArgsMaxChars: 2_000,
        callOutputMaxChars: 4_000,
        mechanicalItemMaxChars: 160,
        prompt: [
            '你在压缩一段对话，让 Agent 能无缝继续工作。',
            '保留用户目标与约束、已完成的事、关键事实、路径、命令、错误、未完成部分和下一步。',
            '只输出连续的中文摘要正文，不要工具调用、标签或代码围栏。',
        ].join('\n'),
    },
    bash: {
        executable: WINDOWS ? 'cmd.exe' : '/bin/zsh',
        args: WINDOWS ? ['/d', '/s', '/c'] : ['-lc'],
        minTimeoutMs: 100,
        defaultTimeoutMs: 120_000,
        maxTimeoutMs: 600_000,
        maxOutputChars: 40_000,
    },
    // client:唯一的客户端。一份服务、一份界面、一个库。
    client: {
        host: '127.0.0.1',
        port: 9800,
        dataFile: './.data/agent-client.db',
        // 新对话默认落在哪一档:ask 逐步确认 / rules 按照规则 / skip 完全跳过
        defaultMode: 'ask',
        // 没人回应确认卡时等多久。到点当拒绝,绝不无限挂起。
        approvalTimeoutMs: 300_000,
        // app 的 iframe sandbox。不给 allow-same-origin —— app 拿到不透明源,
        // 碰不到宿主 DOM 和 cookie;代价是它用不了 localStorage(状态本就该在自己的库里)。
        appSandbox: 'allow-scripts allow-forms',
        appsDir: './apps',
        appDataDir: './.data/apps',
        appStartTimeoutMs: 10_000,
        appIdleTimeoutMs: 600_000,
        images: {
            maxBytes: 8 * 1024 * 1024,
            maxPerMessage: 10,
            maxLiveToolImages: 2,
            directory: './.data/files',
        },
    },
};
