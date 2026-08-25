import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function read({ path, offset = 1, limit = 2000 }, context = {}) {
    if (!context.cwd) throw new Error('read 需要 context.cwd');
    if (!path) throw new Error('path 不能为空');

    const file = resolve(context.cwd, path);
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
