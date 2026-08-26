// 在两次 run 之间按上下文水位压缩早期历史。
import { complete } from '../ai/index.js';

const chars = (item) => {
    try { return JSON.stringify(item).length; } catch { return 0; }
};

const text = (item, config) => {
    if (item?.type === 'function_call') return `${item.name}: ${String(item.arguments || '').slice(0, config.callArgsMaxChars)}`;
    if (item?.type === 'function_call_output') return String(item.output || '').slice(0, config.callOutputMaxChars);
    const content = item?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map((part) => part?.text || '').join('');
    return '';
};

const splitAt = (history, tailChars) => {
    let at = history.length;
    let size = 0;
    while (at > 0 && (size < tailChars || history.length - at < 2)) {
        at -= 1;
        size += chars(history[at]);
    }
    while (at > 0 && history[at]?.type === 'function_call_output') at -= 1;
    while (at > 0 && history[at - 1]?.type === 'function_call') at -= 1;
    return at;
};

const material = (items, config) => items
    .filter((item) => item?.type !== 'reasoning')
    .map((item, index) => `#${index + 1} ${item.role || item.type || 'unknown'}\n${text(item, config)}`)
    .join('\n\n---\n\n');

const mechanical = (items, config) => [
    '[早前对话的机械摘要]',
    ...items.map((item, index) => `#${index + 1} ${item.role || item.type || 'unknown'} ${text(item, config).replace(/\s+/g, ' ').slice(0, config.mechanicalItemMaxChars)}`),
].join('\n');

/** 用量是否已到压缩水位。单独导出给调用方预判(如 Web 端提前广播「正在压缩」)。 */
export function shouldCompact({ usage, compaction }) {
    if (!compaction || typeof compaction !== 'object') throw new Error('compaction 配置必填');
    const used = (Number(usage?.input_tokens) || 0) + (Number(usage?.output_tokens) || 0);
    return Boolean(compaction.contextWindowTokens) && used >= compaction.contextWindowTokens * compaction.foldRatio;
}

export async function compact({
    history,
    usage,
    compaction,
    driver,
    responsesUrl,
    apiKey,
    model,
    errorMaxChars,
    signal,
}) {
    if (!shouldCompact({ usage, compaction })) return { history, compacted: false };

    const at = splitAt(history, compaction.tailKeepChars);
    if (at < 2) return { history, compacted: false };

    const early = history.slice(0, at);
    let summary = '';
    let kind = 'summary';
    let tokens = 0;
    try {
        const result = await complete({
            driver,
            responsesUrl,
            apiKey,
            model,
            instructions: compaction.prompt,
            input: [{ role: 'user', content: `压缩下面的对话：\n\n${material(early, compaction)}` }],
            errorMaxChars,
            signal,
        });
        tokens = (Number(result.usage?.input_tokens) || 0) + (Number(result.usage?.output_tokens) || 0);
        if (String(result.text).trim().length >= compaction.summaryMinChars) summary = String(result.text).trim();
    } catch { /* 摘要失败时使用确定性索引 */ }
    if (!summary) {
        summary = mechanical(early, compaction);
        kind = 'mechanical';
    }

    return {
        compacted: true,
        summary,
        kind,
        tokens,
        sourceCount: early.length,
        tailCount: history.length - at,
        history: [
            { role: 'system', content: `[早前对话的摘要]\n${summary}` },
            ...history.slice(at),
        ],
    };
}
