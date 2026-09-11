// 发给 AI 的工具定义表,不包含任何执行逻辑。confirm 只在宿主给了通道时才发给模型,见 index.js。
export const tools = [
    {
        type: 'function', name: 'propose',
        description: '异步提出建议，立即返回，不等待用户。kind=rule 建议追加本对话规则；kind=prompt 建议下一条用户消息。同意 prompt 只填草稿，不自动发送。不可用来获取危险操作授权，需要等待授权时用 confirm。',
        parameters: { type: 'object', properties: {
            kind: { type: 'string', enum: ['rule', 'prompt'] },
            summary: { type: 'string', description: '简短标题' },
            detail: { type: 'string', description: '提议理由和详情' },
            text: { type: 'string', description: '要追加的规则或填入草稿的完整文本' },
        }, required: ['kind', 'summary', 'detail', 'text'], additionalProperties: false },
    },
    {
        type: 'function',
        name: 'shell',
        description: '在AGENT 项目根目录执行 shell 命令。',
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string', description: '一句话说明调用这个工具的目的' },
                command: { type: 'string', description: '需要执行的命令' },
                timeout_ms: { type: 'integer', description: '超时时间（毫秒）' },
            },
            required: ['summary', 'command'],
            additionalProperties: false,
        },
    },
    {
        type: 'function',
        name: 'read',
        description: '读取文本文件，路径相对于AGENT 项目根目录。',
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string', description: '一句话说明调用这个工具的目的' },
                path: { type: 'string', description: '文件路径' },
                offset: { type: 'integer', description: '起始行，从 1 开始' },
                limit: { type: 'integer', description: '最多读取的行数' },
            },
            required: ['summary', 'path'],
            additionalProperties: false,
        },
    },
    {
        type: 'function',
        name: 'write',
        description: '写入文件，文件存在时覆盖，路径相对于AGENT 项目根目录。',
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string', description: '一句话说明调用这个工具的目的' },
                path: { type: 'string', description: '文件路径' },
                content: { type: 'string', description: '文件内容' },
            },
            required: ['summary', 'path', 'content'],
            additionalProperties: false,
        },
    },
    {
        type: 'function',
        name: 'edit',
        description: '通过精确替换修改文本文件。',
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string', description: '一句话说明调用这个工具的目的' },
                path: { type: 'string', description: '文件路径' },
                old_text: { type: 'string', description: '要替换的原文' },
                new_text: { type: 'string', description: '替换后的文本' },
                replace_all: { type: 'boolean', description: '是否替换所有匹配' },
            },
            required: ['summary', 'path', 'old_text', 'new_text'],
            additionalProperties: false,
        },
    },
    {
        type: 'function',
        name: 'confirm',
        description: [
            '需要用户确认时，在动手之前停下来问用户，等到答复再做。',
            '比如操作不可逆、影响面比交代的大、要动没被明确授权的东西。',
            '得到允许之前不要执行。用户不同意就换做法或如实说明,不要绕过。',
        ].join(''),
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string', description: '一句话说明你打算做什么' },
                detail: { type: 'string', description: '具体到命令、路径和影响范围,让用户能判断' },
                risk: { type: 'string', description: '你觉得风险或不确定在哪里' },
            },
            required: ['summary', 'detail', 'risk'],
            additionalProperties: false,
        },
    },
];
