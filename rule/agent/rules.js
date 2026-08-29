// 规矩:用户写的一句大白话,加上系统为它派生的东西。
//
// 两个出口,硬度不同:
//   prompt  注入提示词 —— 永远有,靠模型自觉
//   match   编译成拦截条件 —— 编译不出来就是空的,界面必须照实说「只靠它自觉」
//
// 用户维护的始终是自己那句 text,不是编译产物。
import { ACTIONS, ACTION_LABELS, TOOLS } from './danger.js';

export const KINDS = Object.freeze(['guard', 'grant', 'memory']);
export const EFFECTS = Object.freeze(['ask', 'deny', 'allow']);
export const MODES = Object.freeze(['ask', 'rules', 'skip']);
export const MODE_LABELS = Object.freeze({ ask: '逐步确认', rules: '按照规则', skip: '完全跳过' });

const unique = (values) => [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];

/** glob → 正则。支持 ** / * / ?,其余字符原样。 */
function globToRegex(glob) {
    let out = '';
    for (let i = 0; i < glob.length; i += 1) {
        const char = glob[i];
        if (char === '*') {
            if (glob[i + 1] === '*') { out += '.*'; i += 1; if (glob[i + 1] === '/') i += 1; }
            else out += '[^/]*';
        } else if (char === '?') out += '[^/]';
        else out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`^${out}$`);
}

/** 路径归一到绝对形式,~ 展开,相对路径按工作目录解析。 */
export function absolutize(value, { home = '', cwd = '' } = {}) {
    let path = String(value || '').replace(/\/+$/, '') || '/';
    if (path.startsWith('~')) path = `${home}${path.slice(1)}`;
    else if (!path.startsWith('/')) path = `${cwd}/${path}`.replace(/\/+/g, '/');
    // 去掉 . 和 ..,不碰文件系统 —— 这里只做字符串归一
    const parts = [];
    for (const part of path.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') { parts.pop(); continue; }
        parts.push(part);
    }
    return `/${parts.join('/')}`;
}

/** 一条规矩的编译产物是否真能拦住东西。三个维度全空 = 拦不住。 */
export const hasGuard = (rule) =>
    rule.kind !== 'memory' && Boolean(rule.match && (rule.match.tools?.length || rule.match.actions?.length || rule.match.paths?.length));

/** 校验并归一。非法的代号 / 动作直接丢掉 —— 编译产物必须在闭集内。 */
export function normalizeRule(raw = {}) {
    const kind = KINDS.includes(raw.kind) ? raw.kind : 'guard';
    const match = kind === 'memory' ? null : {
        tools: unique(raw.match?.tools).filter((item) => TOOLS.includes(item)),
        actions: unique(raw.match?.actions).filter((item) => ACTIONS.includes(item)),
        paths: unique(raw.match?.paths),
    };
    return {
        id: String(raw.id || ''),
        text: String(raw.text || '').trim(),
        kind,
        prompt: String(raw.prompt || raw.text || '').trim(),
        match,
        effect: kind === 'memory' ? '' : (EFFECTS.includes(raw.effect) ? raw.effect : 'ask'),
        enabled: raw.enabled !== 0 && raw.enabled !== false,
        origin: ['user', 'factory', 'agent'].includes(raw.origin) ? raw.origin : 'user',
        conversationId: String(raw.conversationId || ''),
    };
}

/** 这条规矩管不管这次调用。维度之间是与,维度之内是或。 */
export function matches(rule, request, context = {}) {
    if (!hasGuard(rule) || !rule.enabled) return false;
    const { tools, actions, paths } = rule.match;
    if (tools.length && !tools.includes(request.tool)) return false;
    if (actions.length && !actions.some((action) => request.actions.includes(action))) return false;
    if (paths.length) {
        const candidates = request.paths.map((path) => absolutize(path, context));
        const hit = paths.some((glob) => {
            const pattern = globToRegex(absolutize(glob, context));
            // 「~/Downloads/**」必须连 ~/Downloads 自己一起罩住 ——
            // 否则 rm -rf ~/Downloads 反而漏过,而那恰恰是最该拦的一下
            const base = absolutize(String(glob).replace(/\/\*\*$/, ''), context);
            return candidates.some((path) => pattern.test(path) || path === base || path.startsWith(`${base}/`));
        });
        if (!hit) return false;
    }
    return true;
}

/**
 * 判这次调用怎么走。
 *   ask   逐步确认 —— 每次都停下来
 *   rules 按照规则 —— 从上往下,第一条命中的说了算;都没命中就放行
 *   skip  完全跳过 —— 不问不拦
 *
 * **顺序即优先级**。用户能拖动规矩,那顺序就必须真的决定结果 ——
 * 否则界面在演一个不存在的东西。传进来的数组顺序就是判定顺序,
 * 由调用方(store)保证:对话级排在全局之前。
 */
export function decide({ mode, rules = [], request, context = {} }) {
    if (mode === 'skip') return { effect: 'allow', reason: '完全跳过', rule: null };
    if (mode !== 'rules') return { effect: 'ask', reason: '逐步确认', rule: null };

    const rule = rules.find((item) => matches(item, request, context));
    if (!rule) return { effect: 'allow', reason: '没有规矩说到这件事', rule: null };
    return { effect: rule.effect, reason: rule.text, rule };
}

/** 拼进系统提示词的那一段。memory 类也在这儿 —— 用户不该被要求理解两个概念。 */
export function injection(rules = [], mode = 'rules') {
    const live = rules.filter((rule) => rule.enabled);
    if (!live.length) return '';
    const lines = ['## 用户立下的规矩', '这些是用户的要求,优先于你自己的判断:'];
    for (const rule of live) {
        const hard = hasGuard(rule) ? '' : '(没有拦截器兜底,全靠你自觉遵守)';
        const tag = rule.kind === 'memory' ? '背景' : rule.kind === 'grant' ? '免问' : '约束';
        lines.push(`- [${tag}] ${rule.prompt}${hard}`);
    }
    if (mode === 'ask') lines.push('', '当前是逐步确认模式:你的每次工具调用都会先交给用户过目。');
    if (mode === 'skip') lines.push('', '当前是完全跳过模式:没有任何拦截,你要自己为后果负责。');
    return lines.join('\n');
}

export { ACTIONS, ACTION_LABELS, TOOLS };
