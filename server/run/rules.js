// 规则:一张全局的单子,一个总开关。
//
// 启用:规则进系统提示词,confirm 工具在 —— 规则要求先问的,模型调 confirm 等用户答复。
// 停用:规则不进,confirm 不在,提示词里明说没有任何拦截。
//
// 没有硬闸。这是刻意的:正则和词表只能看命令字面,覆盖面小却要养一套编译器;
// 与其给人「拦得住」的错觉,不如把赌注明白地押在模型遵守规则上。
export const RULES_SWITCH = Object.freeze(['on', 'off']);

/** 出厂规则。首次启动铺一次,之后就是普通规则,可停可删,删了不复活。 */
export const SEED_RULES = Object.freeze([
    '删除或移动我的文件之前,先问我。',
    '需要管理员权限、格式化磁盘,或启动常驻后台进程时,先问我。',
    '在我的电脑上安装软件或软件包之前,先问我。',
    '超出我交代范围的动作先问我:不可逆的、花钱的、对外发送的。',
    '发现我的前提有问题,先告诉我,不要自己换方案。',
]);

/**
 * 拼进系统提示词的那段。rules 是启用的规则,顺序就是编号,模型用编号指代要改的规则。
 * @param canConfirm 这一轮有没有人守着答卡。没人守着(app 触发的后台轮次)就没有 confirm。
 * @param canPropose 这一轮有没有 propose 工具。
 */
export function rulesSection({ on, rules = [], canConfirm = true, canPropose = false }) {
    const lines = [];
    if (!on) {
        lines.push(
            '用户停用了规则:没有任何拦截,也没有 confirm 工具。',
            '不要问「要不要继续」,用户选择了让你直接做。只做被交代的事;',
            '交代之外的不可逆操作留着不做,用一句话说明即可。',
        );
    } else {
        lines.push('## 用户的规则', '用户对你提了这些要求,优先于你自己的判断:');
        rules.forEach((rule, index) => lines.push(`- [${index + 1}] ${rule.text}`));
        if (!rules.length) lines.push('(暂无)');
        lines.push('');
        if (canConfirm) {
            lines.push(
                '凡是规则说要先问的,动手之前必须调用 confirm 工具,得到允许才做。',
                '规则没说到、但你自己觉得不可逆或拿不准的,也用 confirm 先问。',
                '普通的可逆步骤不要问,用户已经交代了的事直接做。',
            );
        } else {
            lines.push('这一轮没有人守着,confirm 工具不可用。规则要求先问的事,不做,并在结果里说明。');
        }
    }
    if (canPropose) {
        lines.push(
            '',
            '## 提议',
            '你有 propose 工具:把一个可选项放到用户面前,不阻塞,用户点了才生效。调用后立即返回,不要等,继续手头的事。',
            on
                ? '- kind=rule:用户纠正了你、驳斥了你、或说了一句明显跨对话还成立的偏好时,用用户的口吻写成一条规则提议。'
                : '- kind=rule:用户停用了规则,现在提不了规则;用户说了该记的话,在回复里提醒他启用规则。',
            '  只记跨对话还成立的话:「这个文件用四空格」不记,「不要加署名」记。能并进已有规则的,用 replaces 指编号去改,不新开一条;',
            '  text 留空加 replaces 表示删掉那条。拿不准是不是长期偏好,不要调工具,在回复里问一句。',
            '- kind=prompt:只在真的存在一个需要用户拍板的分叉时,提议下一句话;顺理成章的下一步不提,一次最多一条。',
        );
    }
    return lines.join('\n');
}
