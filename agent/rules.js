// 规则:用户写的一句话,加上系统为它派生的东西。
//
// 一条规则就是一个**触发条件**:命中了就停下来问用户。没有 deny/allow 的分档,
// 也没有类别 —— 该不该做,用户在弹窗那一刻自己判断。
//
// 两个出口,硬度不同:
//   prompt  写进提示词 —— 永远有,靠模型自觉
//   match   编译成拦截条件 —— 编译不出来就是空的,那条规则拦不住任何东西
//
// 用户维护的始终是自己那句 text,不是编译产物。
import { ACTIONS, ACTION_LABELS, TOOLS } from './danger.js';

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
    const parts = [];
    for (const part of path.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') { parts.pop(); continue; }
        parts.push(part);
    }
    return `/${parts.join('/')}`;
}

/** 这条规则有没有真正的拦截条件。三个维度全空 = 拦不住任何东西。 */
export const hasMatch = (rule) =>
    Boolean(rule?.match && (rule.match.tools?.length || rule.match.actions?.length || rule.match.paths?.length));

/** 校验并归一。闭集外的动作和工具直接丢掉 —— 编译产物必须落在词汇表内。 */
export function normalizeRule(raw = {}) {
    return {
        id: String(raw.id || ''),
        text: String(raw.text || '').trim(),
        prompt: String(raw.prompt || raw.text || '').trim(),
        match: {
            tools: unique(raw.match?.tools).filter((item) => TOOLS.includes(item)),
            actions: unique(raw.match?.actions).filter((item) => ACTIONS.includes(item)),
            paths: unique(raw.match?.paths),
        },
        enabled: raw.enabled !== 0 && raw.enabled !== false,
        origin: ['user', 'factory', 'agent'].includes(raw.origin) ? raw.origin : 'user',
    };
}

/** 这条规则管不管这次调用。维度之间是与,维度之内是或。 */
export function matches(rule, request, context = {}) {
    if (!hasMatch(rule) || !rule.enabled) return false;
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
 *   rules 按照规则 —— 命中任意一条规则就停下来;都没命中就放行
 *   skip  完全跳过 —— 不问不拦
 */
export function decide({ mode, rules = [], request, context = {} }) {
    if (mode === 'skip') return { effect: 'allow', reason: '完全跳过', rule: null };
    if (mode !== 'rules') return { effect: 'ask', reason: '逐步确认', rule: null };

    const rule = rules.find((item) => matches(item, request, context));
    if (!rule) return { effect: 'allow', reason: '没有规则说到这件事', rule: null };
    return { effect: 'ask', reason: rule.text, rule };
}

/** 拼进系统提示词的那一段。 */
export function injection(rules = [], mode = 'rules') {
    const live = rules.filter((rule) => rule.enabled);
    const lines = [];
    if (live.length) {
        lines.push('## 用户的规则', '用户对你提了这些要求,优先于你自己的判断:');
        for (const rule of live) {
            const soft = hasMatch(rule) ? '' : '(没有拦截条件兜底,全靠你自觉遵守)';
            lines.push(`- ${rule.prompt}${soft}`);
        }
    }
    if (mode === 'ask') lines.push('', '当前是逐步确认模式:你的每次工具调用都会先交给用户过目。');
    if (mode === 'skip') lines.push('', '当前是完全跳过模式:没有任何拦截,你要自己为后果负责。');
    return lines.join('\n');
}

export { ACTIONS, ACTION_LABELS, TOOLS };
