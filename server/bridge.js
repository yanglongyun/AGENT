// /host/* —— 宿主开放给 app 的契约面。token 即身份,路径里没有 app id。
//
// 一条原则筛出这几个端点:宿主只提供 app 自己拿不到的东西 ——
// 模型、agent、产品界面。文件网络进程它本来就有,不需要宿主转手。
//
// 两道闸,顺序不能反:先认 token(你是谁),再查 manifest.permissions(你被允许什么)。
import { homedir } from 'node:os';

import { complete } from '../ai/index.js';
import { runAgent } from '../agent/index.js';
import { normalizeRule } from '../agent/rules.js';
import { applyCors, handlePreflight } from './cors.js';
import { EVENTS } from '../shared/events.js';

const json = (response, status, body) => {
    applyCors(response);
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
};

const readBody = async (request) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
};

const bearer = (request) => String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

export function createBridge({ config, store, apps, supervisor, channel }) {
    const runtime = () => {
        const settings = store.getSettings();
        if (!settings.responsesUrl || !settings.apiKey || !settings.model) return null;
        return {
            responsesUrl: settings.responsesUrl,
            apiKey: settings.apiKey,
            model: settings.model,
            modelOptions: config.modelOptions,
            retry: config.retry,
            errorMaxChars: config.errorMaxChars,
        };
    };

    return async function bridge(request, response, path) {
        if (handlePreflight(request, response)) return;

        const appId = supervisor.identify(bearer(request));
        const app = appId ? apps.get(appId) : null;
        if (!app) {
            json(response, 401, { error: '凭证无效。用环境变量 APP_TOKEN,放 Authorization: Bearer。' });
            return;
        }
        const need = (permission) => {
            if (app.permissions.includes(permission)) return true;
            json(response, 403, { error: `manifest.permissions 里没有声明 ${permission}` });
            return false;
        };
        const method = request.method || 'GET';

        try {
            if (method === 'GET' && path === '/me') {
                json(response, 200, {
                    appId: app.id, name: app.name, version: app.version,
                    permissions: app.permissions, theme: store.getSettings().theme || 'light',
                });
                return;
            }

            if (method === 'POST' && path === '/ai/complete') {
                if (!need('ai.complete')) return;
                const input = await readBody(request);
                const prompt = String(input.prompt || '').trim();
                if (!prompt) { json(response, 400, { error: 'prompt 不能为空' }); return; }
                const base = runtime();
                if (!base) { json(response, 400, { error: '宿主还没配置模型:请先在设置页填写接口地址、API Key 和模型' }); return; }
                const result = await complete({
                    ...base,
                    instructions: String(input.instructions || '').slice(0, 4000),
                    input: [{ role: 'user', content: prompt.slice(0, 20_000) }],
                });
                json(response, 200, { text: result.text, usage: result.usage });
                return;
            }

            if (method === 'POST' && path === '/ai/agent') {
                if (!need('ai.agent')) return;
                const input = await readBody(request);
                const prompt = String(input.prompt || '').trim();
                if (!prompt) { json(response, 400, { error: 'prompt 不能为空' }); return; }
                const base = runtime();
                if (!base) { json(response, 400, { error: '宿主还没配置模型' }); return; }

                // 走同一道审批门,固定在 rules 档 —— 不继承全局档位:
                // ask 档没人守着弹窗(命中即拒,不挂起),skip 档会让规则对 app 整个失效。
                // 用户的规则对 app 触发的轮次永远生效,这正是「不被绕过」的含义。
                const rules = store.listRules().map(normalizeRule).filter((rule) => rule.enabled);
                const workdir = String(input.workdir || '') || `${config.client.appDataDir}/${app.id}`;

                // SSE:事件词表沿用仓库契约,app 端好消化,curl 也能看
                applyCors(response);
                response.writeHead(200, {
                    'content-type': 'text/event-stream; charset=utf-8',
                    'cache-control': 'no-cache',
                    connection: 'keep-alive',
                });
                const send = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
                try {
                    const result = await runAgent({
                        ...base,
                        bash: config.bash,
                        maxRounds: config.maxRounds,
                        errorMaxChars: config.errorMaxChars,
                        instructions: String(input.instructions || '').slice(0, 4000),
                        workdir,
                        permission: { mode: 'rules', rules, context: { home: homedir(), cwd: workdir } },
                        runId: crypto.randomUUID(),
                        input: [{ role: 'user', content: prompt.slice(0, 20_000) }],
                        env: process.env,
                        emit: (type, data) => {
                            if (data?.item) send(type, { item: data.item });
                            else if (data?.delta) send(type, { delta: data.delta });
                        },
                    });
                    send('done', { status: result.status, usage: result.usage });
                } catch (error) {
                    send('error', { error: String(error?.message || error) });
                }
                response.end();
                return;
            }

            if (method === 'POST' && path === '/notify') {
                if (!need('notify')) return;
                const input = await readBody(request);
                const text = String(input.text || '').trim().slice(0, 300);
                if (!text) { json(response, 400, { error: 'text 不能为空' }); return; }
                const kind = input.kind === 'badge' ? 'badge' : 'toast';
                channel.broadcast(EVENTS.APP_NOTIFY, { appId: app.id, appName: app.name, kind, text });
                json(response, 200, { ok: true });
                return;
            }

            json(response, 404, { error: `宿主没有这个能力:${path}` });
        } catch (error) {
            json(response, error?.status || 500, { error: String(error?.message || error) });
        }
    };
}
