// 健康、元信息、设置、事件通道、在跑的轮次。
import { json, readBody } from './helpers.js';
import { RULES_SWITCH } from '../run/rules.js';

export async function route({ method, path, request, response, config, store, channel, turns, meta }) {
    if (method === 'GET' && path === '/api/health') { json(response, 200, { ok: true }); return true; }
    if (method === 'GET' && path === '/api/meta') {
        json(response, 200, {
            model: store.getSettings().model || '',
            defaultWorkdir: config.workdir,
            version: meta.version,
            rulesEnabled: store.getSettings().rulesEnabled || 'on',
        });
        return true;
    }
    if (method === 'GET' && path === '/api/settings') {
        json(response, 200, { settings: store.getSettings() }); return true;
    }
    if (method === 'PUT' && path === '/api/settings') {
        const input = await readBody(request);
        const allowed = ['responsesUrl', 'apiKey', 'model', 'instructions', 'rulesEnabled'];
        const values = Object.fromEntries(allowed.filter((key) => typeof input[key] === 'string').map((key) => [key, input[key].trim()]));
        if (values.rulesEnabled && !RULES_SWITCH.includes(values.rulesEnabled)) {
            json(response, 400, { error: `rulesEnabled 只能是 on 或 off:${values.rulesEnabled}` }); return true;
        }
        json(response, 200, { settings: store.setSettings(values) }); return true;
    }
    if (method === 'GET' && path === '/api/events') { channel.handle(request, response); return true; }
    if (method === 'GET' && path === '/api/turns') { json(response, 200, { ids: turns.ids() }); return true; }
    return false;
}
