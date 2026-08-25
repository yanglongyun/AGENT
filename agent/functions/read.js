import { readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const IMAGES = new Map([['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.webp', 'image/webp']]);

export async function read({ path, offset = 1, limit = 2000 }, context = {}) {
    if (!context.cwd) throw new Error('read 需要 context.cwd');
    if (!path) throw new Error('path 不能为空');

    const file = resolve(context.cwd, path);
    const mimeType = IMAGES.get(extname(file).toLowerCase());
    if (mimeType) {
        const info = await stat(file);
        return { path: file, image: { path: file, mimeType, size: info.size } };
    }
    const content = await readFile(file, 'utf8');
    const lines = content.split('\n');
    const start = Math.max(1, Number(offset) || 1);
    const count = Math.min(2000, Math.max(1, Number(limit) || 2000));

    return {
        path: file,
        content: lines.slice(start - 1, start - 1 + count).join('\n'),
        offset: start,
        total_lines: lines.length,
    };
}
