// 编译:把用户的一句大白话变成拦截条件。
//
// 调模型做,但一次生成不当数 —— 两层校验:
//   硬校验  产出的动作/工具必须在闭集内,不在的直接丢
//   软校验  再问模型一次「这条拦截器是不是准确表达了那句话」,不通过就降级
//
// **降级不是失败**:编译不出来 → 只留提示词出口,界面照实标「只靠它自觉」。
// 宁可告诉用户「这条拦不住」,也不能让他以为拦得住。
import { complete } from '../../ai/index.js';
import { ACTIONS, ACTION_LABELS, TOOLS, normalizeRule } from '../../agent/rules.js';

const VOCAB = ACTIONS.map((action) => `${action}(${ACTION_LABELS[action]})`).join('、');

const INSTRUCTIONS = [
    '你把用户立的一条规矩翻译成结构化条件。只输出 JSON,不要解释,不要代码围栏。',
    '',
    '字段:',
    '  kind    guard=约束(限制助理) / grant=免问(明确允许) / memory=背景信息(不是禁令)',
    '  effect  deny=直接拒绝 / ask=停下来问用户 / allow=放行不问;kind 为 memory 时给空串',
    '  prompt  用一句完整的话复述这条规矩,给助理看',
    `  actions 命中的危险动作,只能从这些里选:${VOCAB};选不出就给空数组`,
    `  tools   涉及的工具,只能从这些里选:${TOOLS.join('、')};不限定就给空数组`,
    '  paths   涉及的路径,写成 glob,例如 ~/Downloads 或 /etc/**;不涉及就给空数组',
    '',
    '重要:actions / tools / paths 三个都为空,意味着这条规矩没法变成拦截器 —— 这是允许的,',
    '不要为了填满而硬凑一个不准确的条件。宁可空着,也不要编。',
].join('\n');

const parseJson = (text) => {
    const body = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    try { return JSON.parse(body); } catch { return null; }
};

export function createCompiler({ config, store }) {
    const runtime = () => {
        const settings = store.getSettings();
        if (!settings.responsesUrl || !settings.apiKey || !settings.model) return null;
        return {
            driver: settings.driver || config.driver || 'responses',
            responsesUrl: settings.responsesUrl,
            apiKey: settings.apiKey,
            model: settings.model,
            modelOptions: config.modelOptions,
            retry: config.retry,
            errorMaxChars: config.errorMaxChars,
        };
    };

    /** 软校验:让模型自己判一次编译得准不准。判不准就降级,不硬撑。 */
    async function verify(base, text, match, effect) {
        const description = [
            `用户原话:${text}`,
            `编译结果:动作=${match.actions.join(',') || '无'};工具=${match.tools.join(',') || '不限'};路径=${match.paths.join(',') || '不限'};动作=${effect}`,
        ].join('\n');
        const result = await complete({
            ...base,
            instructions: '判断这条编译结果是否准确表达了用户原话,既不过宽也不过窄。只回答 yes 或 no。',
            input: [{ role: 'user', content: description }],
        }).catch(() => null);
        return /yes/i.test(String(result?.text || ''));
    }

    /**
     * @returns { text, kind, prompt, match, effect, compiled, note }
     *   compiled=false 表示只有提示词一个出口。
     */
    return async function compileRule(text, hints = {}) {
        const raw = String(text || '').trim();
        const bare = { text: raw, kind: 'guard', prompt: raw, match: { tools: [], actions: [], paths: [] }, effect: 'ask', compiled: false, note: '' };
        if (!raw) return { ...bare, note: '内容为空' };

        const base = runtime();
        if (!base) return { ...bare, note: '还没配置模型,只能靠助理自觉遵守' };

        const result = await complete({
            ...base,
            instructions: INSTRUCTIONS,
            input: [{ role: 'user', content: raw }],
        }).catch((error) => ({ text: '', error }));

        const parsed = parseJson(result.text);
        if (!parsed) return { ...bare, note: '没能理解成结构化条件,只能靠助理自觉遵守' };

        // 硬校验:归一时闭集外的动作/工具会被直接丢掉
        const rule = normalizeRule({
            text: raw,
            kind: parsed.kind,
            prompt: parsed.prompt || raw,
            effect: parsed.effect,
            match: { tools: parsed.tools, actions: parsed.actions, paths: parsed.paths },
            ...hints,
        });

        if (rule.kind === 'memory') {
            return { ...rule, match: { tools: [], actions: [], paths: [] }, effect: '', compiled: false, note: '背景信息,本来就不需要拦截器' };
        }
        const empty = !rule.match.tools.length && !rule.match.actions.length && !rule.match.paths.length;
        if (empty) return { ...rule, compiled: false, note: '这句话落不成拦截条件,只能靠助理自觉遵守' };

        if (!(await verify(base, raw, rule.match, rule.effect))) {
            return { ...rule, match: { tools: [], actions: [], paths: [] }, compiled: false, note: '编译结果没通过复核,已降级为只靠助理自觉' };
        }
        return { ...rule, compiled: true, note: '' };
    };
}
