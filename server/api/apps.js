// 应用:列表,以及单个应用的取址、图标、token、日志、文档、重启、停止。
import { createReadStream, existsSync } from 'node:fs';
import { json } from './helpers.js';

export async function route({ method, path, segments, response, apps, supervisor }) {
    if (method === 'GET' && path === '/api/apps') {
        json(response, 200, {
            apps: apps.list().map((app) => ({
                id: app.id, name: app.name, version: app.version,
                description: app.description, permissions: app.permissions,
                hasRun: Boolean(app.run), runMode: app.run?.mode || '',
                hasIcon: Boolean(app.iconFile), hasDoc: app.hasDoc,
                ...supervisor.status(app.id),
            })),
        });
        return true;
    }
    if (segments[1] !== 'apps' || !segments[2]) return false;

    const app = apps.get(segments[2]);
    if (!app) { json(response, 404, { error: '没有这个应用' }); return true; }
    // 取址:唯一出口。app 没起就顺手拉起 —— 懒启动的触发点在这里。
    // 地址是运行时事实,消费者(iframe / agent)每次现问,不许缓存
    if (method === 'GET' && segments[3] === 'address') {
        try {
            const record = await supervisor.ensure(app.id);
            json(response, 200, { origin: `http://127.0.0.1:${record.port}`, status: record.status });
        } catch (error) {
            json(response, error?.status || 503, { error: String(error?.message || error), ...supervisor.status(app.id) });
        }
        return true;
    }
    if (method === 'GET' && segments[3] === 'icon') {
        if (app.iconFile && existsSync(app.iconFile)) {
            response.writeHead(200, { 'content-type': app.iconFile.endsWith('.svg') ? 'image/svg+xml' : 'image/png', 'cache-control': 'no-cache' });
            createReadStream(app.iconFile).pipe(response);
            return true;
        }
        json(response, 404, { error: '这个应用没有图标文件' }); return true;
    }
    if (method === 'GET' && segments[3] === 'token') { json(response, 200, { appId: app.id, token: supervisor.tokenFor(app.id) }); return true; }
    if (method === 'GET' && segments[3] === 'logs') { json(response, 200, { logs: supervisor.logs(app.id) }); return true; }
    if (method === 'GET' && segments[3] === 'doc') { json(response, 200, { doc: apps.readDoc(app.id) }); return true; }
    if (method === 'POST' && segments[3] === 'restart') {
        await supervisor.restart(app.id).catch(() => { /* 状态已记录 */ });
        json(response, 200, supervisor.status(app.id)); return true;
    }
    if (method === 'POST' && segments[3] === 'stop') {
        await supervisor.stop(app.id);
        json(response, 200, supervisor.status(app.id)); return true;
    }
    return false;
}
