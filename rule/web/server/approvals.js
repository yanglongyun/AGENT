// 待确认的工具调用。一次调用停在这儿,直到用户表态、超时,或整轮被停。
//
// 三条出口都必须有人兜底 —— 悬着的 Promise 会把整轮 agent 永远挂住,
// 而挂住的那一轮既不入库也不报错,是最难查的一类故障。
import { EVENTS } from '../shared/events.js';

export function createApprovals({ broadcast, timeoutMs = 300_000 }) {
    const pending = new Map();

    function settle(id, answer) {
        const entry = pending.get(id);
        if (!entry) return false;
        pending.delete(id);
        clearTimeout(entry.timer);
        entry.cleanup();
        broadcast(EVENTS.APPROVAL_DONE, { id, conversationId: entry.card.conversationId, answer });
        entry.resolve(answer);
        return true;
    }

    return {
        /** 刷新页面要能把还悬着的卡捞回来,否则用户永远等不到那个弹窗。 */
        listFor: (conversationId) => [...pending.values()]
            .filter((entry) => entry.card.conversationId === conversationId)
            .map((entry) => entry.card),

        respond: (id, answer) => settle(id, answer === 'allow' ? 'allow' : 'deny'),

        request({ conversationId, name, request, verdict, signal }) {
            const id = crypto.randomUUID();
            const card = {
                id,
                conversationId,
                tool: name,
                summary: request.summary,
                command: request.command,
                paths: request.paths,
                actions: request.actions,
                reason: verdict.reason,
                rule: verdict.rule ? { id: verdict.rule.id, text: verdict.rule.text } : null,
                at: new Date().toISOString(),
            };
            return new Promise((resolve) => {
                const timer = setTimeout(() => settle(id, 'timeout'), timeoutMs);
                const onAbort = () => settle(id, 'deny');
                signal?.addEventListener('abort', onAbort, { once: true });
                pending.set(id, {
                    resolve,
                    timer,
                    card,
                    cleanup: () => signal?.removeEventListener('abort', onAbort),
                });
                broadcast(EVENTS.APPROVAL_ASK, card);
            });
        },
    };
}
