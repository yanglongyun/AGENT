import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// ---- 行尾 ----
// 模型看到的和 edit 用来匹配的,必须是同一套行尾。read 也用这里的 toLf。
// 只处理 CRLF:孤立的 \r(经典 Mac 行尾)原样保留,避免把它当行尾误改。
// 因此纯 LF 文件走归一化后与原字节完全一致,不会被无谓改写。

/** 取文件的主导行尾。以先出现的那个为准。 */
export function detectLineEnding(content) {
    const crlf = content.indexOf('\r\n');
    if (crlf === -1) return '\n';
    const lf = content.indexOf('\n');
    // CRLF 里的 \n 位于 \r 之后一位;若首个 \n 更靠前,说明文件以 LF 为主。
    return crlf < lf ? '\r\n' : '\n';
}

/** CRLF → LF。 */
export function toLf(text) {
    return text.includes('\r\n') ? text.replace(/\r\n/g, '\n') : text;
}

/** LF → 原始行尾。 */
export function restoreLineEnding(text, ending) {
    return ending === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

// ---- 工具 ----

export async function edit({ path, old_text, new_text = '', replace_all = false }, context = {}) {
    if (!context.cwd) throw new Error('edit 需要 context.cwd');
    if (!path) throw new Error('path 不能为空');
    if (!old_text) throw new Error('old_text 不能为空');

    const file = resolve(context.cwd, path);
    const raw = await readFile(file, 'utf8');

    // 归一化到 LF 再匹配：模型基于 read 的输出构造 old_text，而 read 也按 LF 返回。
    // 不这样做时，CRLF 文件上任何跨行的 old_text 都匹配不到。
    const ending = detectLineEnding(raw);
    const content = toLf(raw);
    const target = toLf(String(old_text));
    const replacement = toLf(String(new_text));

    const matches = content.split(target).length - 1;
    if (matches === 0) throw new Error('未找到 old_text');
    if (matches > 1 && !replace_all) throw new Error(`old_text 出现 ${matches} 次，请提供唯一文本或设置 replace_all`);

    // 按下标切片拼接，不走 String.replace：后者即使首参是普通字符串，
    // 也会把替换文本里的 $&、$`、$'、$n、$$ 当替换模式解释，静默写错内容。
    let result;
    if (replace_all) {
        result = content.split(target).join(replacement);
    } else {
        const at = content.indexOf(target);
        result = content.slice(0, at) + replacement + content.slice(at + target.length);
    }

    await writeFile(file, restoreLineEnding(result, ending), 'utf8');

    return { path: file, replacements: replace_all ? matches : 1 };
}
