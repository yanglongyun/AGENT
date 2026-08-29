// 审批门:包在每个工具执行器外面的一层。
//
// 位置是有讲究的 —— 它在 agent/,不在 ai/。ai/ 依然不感知工具、不感知权限,
// 它只知道「执行器返回了一个结果」。被拒绝也是一种结果。
//
// 拒绝以工具输出的形式回给模型(而不是抛错中断整轮),模型于是能换招或
// 如实告诉用户做不了 —— 这比让它撞死在半路上有用。
import { describe } from './danger.js';
import { decide } from './rules.js';

const refusal = (reason) => ({ error: `用户拒绝了这次操作:${reason}。不要重试同一件事,换个做法或直接告诉用户。` });

/**
 * @param executors 原始执行器表
 * @param permission { mode, rules, context, ask }
 *   ask(payload) → 'allow' | 'deny';由宿主实现(弹卡、等回应)。
 *   没给 ask 就等于没人可问 —— 一律当拒绝,绝不挂起。
 */
export function gate(executors, permission = {}) {
    const { mode = 'ask', rules = [], context = {}, ask = null, onDecision = () => {} } = permission;
    const wrapped = new Map();

    for (const [name, execute] of executors) {
        wrapped.set(name, async (args, runContext) => {
            const request = describe(name, args);
            const verdict = decide({ mode, rules, request, context });
            onDecision({ name, request, verdict, phase: 'decided' });

            if (verdict.effect === 'deny') return refusal(verdict.reason);
            if (verdict.effect === 'ask') {
                // 没人可问就当场拒绝,不挂起 —— 后台任务不该被一个没人看的弹窗卡住
                if (typeof ask !== 'function') return refusal('当前没有人可以确认这次操作');
                const answer = await ask({ name, request, verdict });
                if (answer !== 'allow') return refusal(answer === 'timeout' ? '确认超时' : '用户在确认时选择了不允许');
            }
            return execute(args, runContext);
        });
    }
    return wrapped;
}
