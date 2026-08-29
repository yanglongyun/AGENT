// 请示工具。
//
// 规则是**你**定的条件,系统照着拦;请示是**助理**自己的判断 —— 它觉得这一步敏感、
// 可能不可逆、或者拿不准你愿不愿意,就主动停下来问一句。规则没说到的地方也管用。
//
// 两条边界必须守住:
//   1. 它只能**增加**摩擦,不能减少。没有任何路径能让助理靠调用它来跳过规则。
//   2. 它是助理的判断,不是保证。界面不许让人以为「危险操作它一定会问」。

export const consultTool = {
    type: 'function',
    name: 'consult',
    description: [
        '在动手之前先请示用户。用在你自己觉得该问一句的时候:',
        '操作不可逆、影响面比你被交代的更大、要动你没被明确授权的东西、',
        '或者你注意到用户的处境可能和你的默认假设不一样。',
        '得到允许之前不要执行。用户不同意就换做法或如实说明,不要绕过。',
    ].join(''),
    parameters: {
        type: 'object',
        properties: {
            summary: { type: 'string', description: '一句话说明你打算做什么' },
            detail: { type: 'string', description: '具体到命令、路径和影响范围,让用户能判断' },
            risk: { type: 'string', description: '你觉得风险或不确定在哪里' },
            suggestion: {
                type: 'string',
                description: '可选。如果用户以后也该在这类操作上被问一次,写一条规则原话,例如「删整个目录之前先问我」',
            },
        },
        required: ['summary', 'detail', 'risk'],
        additionalProperties: false,
    },
};

/**
 * @param ask 宿主提供的问询通道(和审批门共用一条)。没有就等于没人可问。
 */
export function createConsult({ ask }) {
    return async function consult(args = {}) {
        if (typeof ask !== 'function') {
            return { approved: false, reason: '当前没有人可以请示,按未获批准处理。' };
        }
        const answer = await ask({
            source: 'consult',
            consult: {
                summary: String(args.summary || '').slice(0, 300),
                detail: String(args.detail || '').slice(0, 4000),
                risk: String(args.risk || '').slice(0, 1000),
                suggestion: String(args.suggestion || '').slice(0, 200),
            },
        });
        if (answer === 'allow') return { approved: true, reason: '用户同意了,可以继续。' };
        return {
            approved: false,
            reason: answer === 'timeout'
                ? '请示超时,没有得到答复。不要执行,如实告诉用户。'
                : '用户不同意。不要执行这件事,换个做法或如实说明,不要绕过。',
        };
    };
}
