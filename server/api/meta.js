// 健康、元信息、设置、事件通道、在跑的轮次。
import { json, readBody } from './helpers.js';

export async function route({ method, path, request, response, config, store, channel, turns, meta }) {
    if (method === 'GET' && path === '/api/health') { json(response, 200, { ok: true }); return true; }
    if (method === 'GET' && path === '/api/meta') {
        json(response, 200, {
            model: store.getSettings().model || '',
            version: meta.version,
        });
        return true;
    }
    if (method === 'GET' && path === '/api/settings') {
        json(response, 200, { settings: store.getSettings() }); return true;
    }
    if (method === 'PUT' && path === '/api/settings') {
        const input = await readBody(request);
        const allowed = ['responsesUrl', 'apiKey', 'model', 'instructions'];
        const values = Object.fromEntries(allowed.filter((key) => typeof input[key] === 'string').map((key) => [key, input[key].trim()]));
        json(response, 200, { settings: store.setSettings(values) }); return true;
    }
    if (method === 'GET' && path === '/api/events') { channel.handle(request, response); return true; }
    if (method === 'GET' && path === '/api/turns') { json(response, 200, { ids: turns.ids() }); return true; }
    return false;
}
