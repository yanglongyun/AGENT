// confirm 工具:动手前停下来问用户。
//
// 这是唯一的问询机制。用户的规则在系统提示词里,规则说要先问的,模型靠它来问;
// 规则没说到、模型自己拿不准的,也靠它。没有硬闸兜底 —— 它是模型的自觉,不是保证。

/**
 * @param ask 宿主提供的问询通道(和审批门共用一条)。没有就等于没人可问。
 */
export function createConfirm({ ask }) {
    return async function runConfirm(args = {}) {
        if (typeof ask !== 'function') {
            return { approved: false, reason: '当前没有人可以确认,按未获批准处理。' };
        }
        const answer = await ask({
            source: 'confirm',
            confirm: {
                summary: String(args.summary || '').slice(0, 300),
                detail: String(args.detail || '').slice(0, 4000),
                risk: String(args.risk || '').slice(0, 1000),
            },
        });
        if (answer === 'allow') return { approved: true, reason: '用户同意了,可以继续。' };
        return {
            approved: false,
            reason: answer === 'timeout'
                ? '提醒超时,没有得到答复。不要执行,如实告诉用户。'
                : '用户不同意。不要执行这件事,换个做法或如实说明,不要绕过。',
        };
    };
}
