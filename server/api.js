// /api/* 路由表。只做解析、校验和应答,业务在 store / runs / channel 里。
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVENTS } from '../shared/events.js';
import { DRIVER_IDS } from '../ai/index.js';
import { MODES, normalizeRule } from '../agent/rules.js';

const json = (response, status, body) => {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
};

const readBody = async (request) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
};

const isDirectory = (path) => {
    try { return statSync(path).isDirectory(); } catch { return false; }
};

export function createApi({ config, store, runs, files, channel, approvals, compileRule, apps, supervisor, meta }) {
    /** 校验并归一工作目录;非法时返回 null。 */
    const normalizeWorkdir = (value) => {
        const path = resolve(String(value || '').trim() || config.workdir);
        return isDirectory(path) ? path : null;
    };

    /** 处理了返回 true;不是 /api 请求返回 false 交给静态层。 */
    return async function handle(request, response, url) {
        if (!url.pathname.startsWith('/api/')) return false;
        const segments = url.pathname.split('/').filter(Boolean);
        const method = request.method || 'GET';

        try {
            if (method === 'GET' && url.pathname === '/api/health') { json(response, 200, { ok: true }); return true; }
            if (method === 'GET' && url.pathname === '/api/meta') {
                json(response, 200, {
                    model: store.getSettings().model || '',
                    defaultWorkdir: config.workdir,
                    version: meta.version,
                    defaultMode: store.getSettings().permissionMode || config.client.defaultMode || 'ask',
                    defaultConsult: store.getSettings().consult || 'off',
                });
                return true;
            }
            if (method === 'GET' && url.pathname === '/api/settings') {
                json(response, 200, { settings: store.getSettings() }); return true;
            }
            if (method === 'PUT' && url.pathname === '/api/settings') {
                const input = await readBody(request);
                const allowed = ['driver', 'responsesUrl', 'apiKey', 'model', 'instructions', 'permissionMode', 'consult'];
                const values = Object.fromEntries(allowed.filter((key) => typeof input[key] === 'string').map((key) => [key, input[key].trim()]));
                // 驱动名要挡在这里 —— 存进去一个不认识的值,下次运行才炸就太晚了
                if (values.driver && !DRIVER_IDS.includes(values.driver)) {
                    json(response, 400, { error: `未知的驱动:${values.driver}` }); return true;
                }
                if (values.permissionMode && !MODES.includes(values.permissionMode)) {
                    json(response, 400, { error: `未知的权限档:${values.permissionMode}` }); return true;
                }
                const settings = store.setSettings(values);
                json(response, 200, { settings }); return true;
            }
            if (method === 'GET' && url.pathname === '/api/events') { channel.handle(request, response); return true; }
            if (method === 'GET' && url.pathname === '/api/runs') { json(response, 200, { ids: runs.ids() }); return true; }
            // ---- app ----
            if (method === 'GET' && url.pathname === '/api/apps') {
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
            if (segments[1] === 'apps' && segments[2]) {
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
                if (method === 'GET' && segments[3] === 'token') {
                    json(response, 200, { appId: app.id, token: supervisor.tokenFor(app.id) }); return true;
                }
                if (method === 'GET' && segments[3] === 'logs') {
                    json(response, 200, { logs: supervisor.logs(app.id) }); return true;
                }
                if (method === 'GET' && segments[3] === 'doc') {
                    json(response, 200, { doc: apps.readDoc(app.id) }); return true;
                }
                if (method === 'POST' && segments[3] === 'restart') {
                    await supervisor.restart(app.id).catch(() => { /* 状态已记录 */ });
                    json(response, 200, supervisor.status(app.id)); return true;
                }
                if (method === 'POST' && segments[3] === 'stop') {
                    await supervisor.stop(app.id);
                    json(response, 200, supervisor.status(app.id)); return true;
                }
            }

            // ---- 规则 ----
            if (method === 'GET' && url.pathname === '/api/rules') {
                json(response, 200, { rules: store.listRules() });
                return true;
            }
            if (method === 'POST' && url.pathname === '/api/rules') {
                const input = await readBody(request);
                const text = String(input.text || '').trim();
                if (!text) { json(response, 400, { error: '先写下你的规则' }); return true; }
                // 编译在这里发生:大白话进去,拦截条件出来;编译不出来就只剩提示词那一个出口
                const compiled = await compileRule(text);
                const rule = store.createRule({ ...normalizeRule(compiled), id: crypto.randomUUID() });
                channel.broadcast(EVENTS.RULES_CHANGED, {});
                json(response, 201, { rule, note: compiled.note, compiled: compiled.compiled });
                return true;
            }
            if (segments[1] === 'rules' && segments[2]) {
                const id = segments[2];
                if (method === 'PATCH') {
                    const input = await readBody(request);
                    const current = store.getRule(id);
                    if (!current) { json(response, 404, { error: '规则不存在' }); return true; }

                    let patch = input;
                    let note = '';
                    let compiled = true;
                    const text = typeof input.text === 'string' ? input.text.trim() : '';
                    // 改了原话就必须重新编译。text 是真相,match 只是它的派生物 ——
                    // 让两者各说各话,就是把「拦得住」变成一句谎话
                    if (text && text !== current.text) {
                        const result = await compileRule(text);
                        patch = { ...result, ...input, text };
                        note = result.note;
                        compiled = result.compiled;
                    }
                    const rule = store.updateRule(id, patch);
                    channel.broadcast(EVENTS.RULES_CHANGED, {});
                    json(response, 200, { rule, note, compiled }); return true;
                }
                if (method === 'DELETE') {
                    const deleted = store.deleteRule(id);
                    channel.broadcast(EVENTS.RULES_CHANGED, {});
                    json(response, 200, { deleted }); return true;
                }
            }

            // ---- 审批 ----
            if (method === 'GET' && url.pathname === '/api/approvals') {
                // 刷新页面要能把还悬着的卡捞回来
                json(response, 200, { approvals: approvals.listFor(url.searchParams.get('conversationId') || '') });
                return true;
            }
            if (method === 'POST' && segments[1] === 'approvals' && segments[2]) {
                const input = await readBody(request);
                json(response, 200, { settled: approvals.respond(segments[2], input.answer) });
                return true;
            }
            if (method === 'GET' && segments[1] === 'files' && segments[2]) {
                if (await files.serve(segments[2], response)) return true;
                json(response, 404, { error: '文件不存在' }); return true;
            }
            if (method === 'POST' && url.pathname === '/api/files') {
                const attachment = await files.upload(await readBody(request));
                json(response, 201, { attachment }); return true;
            }

            if (method === 'GET' && url.pathname === '/api/conversations') {
                json(response, 200, { conversations: store.listConversations() });
                return true;
            }
            if (method === 'POST' && url.pathname === '/api/conversations') {
                const input = await readBody(request);
                const workdir = normalizeWorkdir(input.workdir);
                if (!workdir) { json(response, 400, { error: '工作目录不存在' }); return true; }
                const conversation = store.createConversation({
                    id: crypto.randomUUID(),
                    title: String(input.title || '').trim().slice(0, 64) || '新对话',
                    workdir,
                });
                channel.broadcast(EVENTS.CONVERSATIONS_CHANGED, {});
                json(response, 201, { conversation });
                return true;
            }

            if (segments[0] === 'api' && segments[1] === 'conversations' && segments[2]) {
                const id = segments[2];
                const conversation = store.getConversation(id);
                if (!conversation) { json(response, 404, { error: '对话不存在' }); return true; }

                if (method === 'PATCH' && segments.length === 3) {
                    const input = await readBody(request);
                    if (typeof input.title === 'string') {
                        const title = input.title.trim().slice(0, 64);
                        if (!title) { json(response, 400, { error: '标题不能为空' }); return true; }
                        store.setTitle(id, title);
                    }
                    if (typeof input.pinned === 'boolean') store.setPinned(id, input.pinned);
                    if (typeof input.permissionMode === 'string') {
                        // 空串 = 取消对话级覆盖,回到跟随全局默认
                        if (input.permissionMode && !MODES.includes(input.permissionMode)) {
                            json(response, 400, { error: `未知的权限档:${input.permissionMode}` }); return true;
                        }
                        store.setPermissionMode(id, input.permissionMode);
                    }
                    // 空串 = 跟随全局默认;'on' / 'off' = 这个对话自己说了算
                    if (typeof input.consult === 'string') store.setConsult(id, input.consult);
                    if (typeof input.workdir === 'string') {
                        const workdir = normalizeWorkdir(input.workdir);
                        if (!workdir) { json(response, 400, { error: '工作目录不存在' }); return true; }
                        store.setWorkdir(id, workdir);
                    }
                    channel.broadcast(EVENTS.CONVERSATIONS_CHANGED, {});
                    json(response, 200, { conversation: store.getConversation(id) });
                    return true;
                }
                if (method === 'DELETE' && segments.length === 3) {
                    runs.stop(id);
                    const deleted = store.deleteConversation(id);
                    channel.broadcast(EVENTS.CONVERSATION_DELETED, { conversationId: id });
                    channel.broadcast(EVENTS.CONVERSATIONS_CHANGED, {});
                    json(response, 200, { deleted });
                    return true;
                }
                if (method === 'GET' && segments[3] === 'messages') {
                    const before = Number(url.searchParams.get('before')) || 0;
                    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 60));
                    json(response, 200, store.listMessages(id, { before, limit }));
                    return true;
                }
                if (method === 'POST' && segments[3] === 'messages') {
                    const input = await readBody(request);
                    const content = String(input.content || '').trim();
                    const attachments = files.normalizeMany(input.attachments);
                    if (!content && !attachments.length) { json(response, 400, { error: '消息不能为空' }); return true; }
                    const message = runs.start(conversation, content, attachments, String(input.clientId || ''));
                    json(response, 202, { message });
                    return true;
                }
                if (method === 'POST' && segments[3] === 'stop') {
                    json(response, 200, { stopped: runs.stop(id) });
                    return true;
                }
            }

            json(response, 404, { error: '接口不存在' });
        } catch (error) {
            json(response, error?.status || 500, { error: String(error?.message || error) });
        }
        return true;
    };
}
