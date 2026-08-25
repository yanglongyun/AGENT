import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function edit({ path, old_text, new_text = '', replace_all = false }, context = {}) {
    if (!context.cwd) throw new Error('edit 需要 context.cwd');
    if (!path) throw new Error('path 不能为空');
    if (!old_text) throw new Error('old_text 不能为空');

    const file = resolve(context.cwd, path);
    const content = await readFile(file, 'utf8');
    const matches = content.split(old_text).length - 1;
    if (matches === 0) throw new Error('未找到 old_text');
    if (matches > 1 && !replace_all) throw new Error(`old_text 出现 ${matches} 次，请提供唯一文本或设置 replace_all`);

    const result = replace_all
        ? content.split(old_text).join(String(new_text))
        : content.replace(old_text, String(new_text));
    await writeFile(file, result, 'utf8');

    return { path: file, replacements: replace_all ? matches : 1 };
}
