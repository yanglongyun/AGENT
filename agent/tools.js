// 发给 AI 的工具定义表,不包含任何执行逻辑。confirm 和 propose 只在宿主给了通道时才发给模型,见 index.js。
export const tools = [
    {
        type: 'function',
        name: 'bash',
        description: '在工作目录执行 bash 命令。',
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
        description: '读取文本文件，路径相对于工作目录。',
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
        description: '写入文件，文件存在时覆盖，路径相对于工作目录。',
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
            '在动手之前停下来问用户,等到答复再做。两种情况必须用它:',
            '一是用户的规则说了要先问的操作;二是你自己觉得该问一句的时候,',
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
    {
        type: 'function',
        name: 'propose',
        description: [
            '把一个可选项放到用户面前,不阻塞,用户点了才生效。调用后立即返回,不要等结果,继续手头的事。',
            'kind=rule:提议记一条规则,或用 replaces 指编号改、删已有的那条(text 留空 = 删)。',
            'kind=prompt:提议用户的下一句话,用户点了会填进输入框,由用户决定发不发。',
        ].join(''),
        parameters: {
            type: 'object',
            properties: {
                kind: { type: 'string', enum: ['rule', 'prompt'], description: 'rule 记规则;prompt 建议下一句话' },
                text: { type: 'string', description: 'rule:规则原文,用用户的口吻;prompt:建议的那句话' },
                replaces: { type: 'integer', description: '仅 rule。要改或删的已有规则编号(提示词里方括号中的数字)' },
            },
            required: ['kind', 'text'],
            additionalProperties: false,
        },
    },
];
