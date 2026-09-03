// 规则单:列、加、排序、改、删。
import { EVENTS } from '../../shared/events.js';
import { json, readBody } from './helpers.js';

export async function route({ method, path, segments, request, response, store, channel }) {
    if (method === 'GET' && path === '/api/rules') { json(response, 200, { rules: store.listRules() }); return true; }
    if (method === 'POST' && path === '/api/rules') {
        const input = await readBody(request);
        const text = String(input.text || '').trim();
        if (!text) { json(response, 400, { error: '先写下你的规则' }); return true; }
        const rule = store.createRule({ id: crypto.randomUUID(), text });
        channel.broadcast(EVENTS.RULES_CHANGED, {});
        json(response, 201, { rule }); return true;
    }
    if (method === 'POST' && path === '/api/rules/reorder') {
        const input = await readBody(request);
        store.reorderRules(Array.isArray(input.ids) ? input.ids : []);
        channel.broadcast(EVENTS.RULES_CHANGED, {});
        json(response, 200, { rules: store.listRules() }); return true;
    }
    if (segments[1] !== 'rules' || !segments[2]) return false;

    const id = segments[2];
    if (method === 'PATCH') {
        const input = await readBody(request);
        if (!store.getRule(id)) { json(response, 404, { error: '规则不存在' }); return true; }
        const patch = {};
        if (typeof input.text === 'string' && input.text.trim()) patch.text = input.text.trim();
        if (typeof input.enabled === 'boolean') patch.enabled = input.enabled;
        const rule = store.updateRule(id, patch);
        channel.broadcast(EVENTS.RULES_CHANGED, {});
        json(response, 200, { rule }); return true;
    }
    if (method === 'DELETE') {
        const deleted = store.deleteRule(id);
        channel.broadcast(EVENTS.RULES_CHANGED, {});
        json(response, 200, { deleted }); return true;
    }
    return false;
}
