// /host/* —— 宿主开放给 app 的契约面。token 即身份,路径里没有 app id。
//
// 一条原则筛出这几个端点:宿主只提供 app 自己拿不到的东西 ——
// 模型、agent、产品界面。文件网络进程它本来就有,不需要宿主转手。
//
// 两道闸,顺序不能反:先认 token(你是谁),再查 manifest.permissions(你被允许什么)。
import { applyCors, handlePreflight } from '../http/cors.js';
import { EVENTS } from '../../shared/events.js';

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

export function createBridge({ config, store, apps, supervisor, channel, turns }) {
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
                let format;
                if (input.schema !== undefined) {
                    const name = input.schemaName ?? 'result';
                    if (!input.schema || typeof input.schema !== 'object' || Array.isArray(input.schema)
                        || input.schema.type !== 'object' || typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
                        json(response, 400, { error: 'schema 必须是 object 类型的 JSON Schema，schemaName 只允许字母、数字、下划线和连字符（1–64 字符）' }); return;
                    }
                    format = { type: 'json_schema', name, schema: input.schema, strict: true };
                }
                const base = runtime();
                if (!base) { json(response, 400, { error: '宿主还没配置模型:请先在设置页填写接口地址、API Key 和模型' }); return; }
                const task = store.createThread({ type: 'task', title: String(input.title || '').trim().slice(0, 64) || prompt.slice(0, 24) });
                const onClose = () => turns.stop(task.id);
                response.on('close', onClose);
                try {
                    const { finished } = turns.start(task, prompt.slice(0, 20_000), [], '', {
                        single: true, interactive: false, format, instructions: String(input.instructions || '').slice(0, 4000),
                    });
                    const result = await finished;
                    if (!response.destroyed) json(response, result.error ? 502 : 200, { task: task.id, ...result });
                } finally { response.off('close', onClose); }
                return;
            }

            if (method === 'POST' && path === '/ai/agent') {
                if (!need('ai.agent')) return;
                const input = await readBody(request);
                const prompt = String(input.prompt || '').trim();
                if (!prompt) { json(response, 400, { error: 'prompt 不能为空' }); return; }
                const base = runtime();
                if (!base) { json(response, 400, { error: '宿主还没配置模型' }); return; }

                const task = store.createThread({ type: 'task', title: String(input.title || '').trim().slice(0, 64) || prompt.slice(0, 24) });
                applyCors(response);
                response.writeHead(200, {
                    'content-type': 'text/event-stream; charset=utf-8',
                    'cache-control': 'no-cache',
                    connection: 'keep-alive',
                });
                const send = (type, data) => {
                    if (!response.destroyed && !response.writableEnded) response.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
                };
                // App 任务和聊天共用落库、摘要、停止及关闭收尾逻辑。
                send('task', { id: task.id });
                const onClose = () => turns.stop(task.id);
                response.on('close', onClose);
                try {
                    const { finished } = turns.start(task, prompt.slice(0, 20_000), [], '', {
                        interactive: false,
                        instructions: String(input.instructions || '').slice(0, 4000),
                        emit: (type, data) => {
                            if (data?.item) send(type, { item: data.item });
                            else if (data?.delta) send(type, { delta: data.delta });
                        },
                    });
                    const result = await finished;
                    send(result.error ? 'error' : 'done', { task: task.id, ...result });
                } catch (error) {
                    store.setStatus(task.id, 'failed');
                    send('error', { task: task.id, error: String(error?.message || error) });
                } finally {
                    response.off('close', onClose);
                    response.end();
                }
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
