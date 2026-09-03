// propose 工具:把一个可选项放到用户面前,不阻塞。
//
// 这里只整理参数。存哪、怎么显示、点了之后发生什么,都是宿主的事 —— 通过 propose 通道递进来。
// 模型调完立刻拿到「已提议」,不等用户,继续干活。

/**
 * @param propose 宿主提供的提议通道:propose({ kind, text, replaces }) → 工具结果对象。
 */
export function createPropose({ propose }) {
    return async function runPropose(args = {}) {
        const kind = String(args.kind || '');
        if (kind !== 'rule' && kind !== 'prompt') return { error: 'kind 只能是 rule 或 prompt' };
        return propose({
            kind,
            text: String(args.text || '').trim().slice(0, 500),
            replaces: Number.isInteger(args.replaces) && args.replaces > 0 ? args.replaces : 0,
        });
    };
}
