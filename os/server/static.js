// 生产前端静态文件。带指纹的 /assets/* 永久缓存,入口 HTML 永不缓存。
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
};

export function serveStatic(root, pathname, response) {
    const base = resolve(root);
    const requested = resolve(base, `.${pathname}`);
    let file = requested.startsWith(base) ? requested : join(base, 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(base, 'index.html');
    if (!existsSync(file)) return false;

    const immutable = pathname.startsWith('/assets/') && file !== join(base, 'index.html');
    response.writeHead(200, {
        'content-type': types[extname(file)] || 'application/octet-stream',
        'content-length': statSync(file).size,
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    createReadStream(file).pipe(response);
    return true;
}
