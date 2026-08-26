import { readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { toLf } from './text.js';

const IMAGES = new Map([['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.webp', 'image/webp']]);
const MAX_LIMIT = 2000;

export async function read({ path, offset = 1, limit = MAX_LIMIT }, context = {}) {
    if (!context.cwd) throw new Error('read 需要 context.cwd');
    if (!path) throw new Error('path 不能为空');

    const file = resolve(context.cwd, path);
    const mimeType = IMAGES.get(extname(file).toLowerCase());
    if (mimeType) {
        const info = await stat(file);
        return { path: file, image: { path: file, mimeType, size: info.size } };
    }
    // 按 LF 返回，和 edit 的匹配口径保持一致，行尾的 \r 不会漏给模型。
    const content = toLf(await readFile(file, 'utf8'));
    const lines = content.split('\n');
    // 以换行结尾的文件会切出一个尾随空串，它不是一行，否则行号整体多 1。
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const start = Math.max(1, Number(offset) || 1);
    const count = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || MAX_LIMIT));

    return {
        path: file,
        content: lines.slice(start - 1, start - 1 + count).join('\n'),
        offset: start,
        total_lines: lines.length,
    };
}
