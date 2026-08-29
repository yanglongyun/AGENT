// /apps/:id/host/* → 宿主开放给 app 的能力。
//
// 两道闸,顺序不能反:先认 token(你是谁),再查 manifest.permissions(你被允许什么)。
// 没在 manifest 里声明的能力直接 403 —— 权限是安装时就写死的,不是运行时协商的。
import { complete } from '../ai/index.js';
import { applyCors, handlePreflight } from './cors.js';

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

export function createBridge({ config, store, supervisor }) {
    return async function bridge(request, response, { app, path }) {
        if (handlePreflight(request, response)) return;

        if (!supervisor.verify(app.id, bearer(request))) {
            json(response, 401, { error: '凭证无效。前端向宿主发 os.ready 取 token,后端用环境变量 APP_TOKEN。' });
            return;
        }
        const method = request.method || 'GET';
        const need = (permission) => {
            if (app.permissions.includes(permission)) return true;
            json(response, 403, { error: `manifest.permissions 里没有声明 ${permission}` });
            return false;
        };

        try {
            if (method === 'GET' && path === '/me') {
                json(response, 200, { appId: app.id, name: app.name, version: app.version, permissions: app.permissions });
                return;
            }

            if (method === 'POST' && path === '/ai/complete') {
                if (!need('ai.complete')) return;
                const input = await readBody(request);
                const prompt = String(input.prompt || '').trim();
                if (!prompt) { json(response, 400, { error: 'prompt 不能为空' }); return; }

                const settings = store.getSettings();
                if (!settings.responsesUrl || !settings.apiKey || !settings.model) {
                    json(response, 400, { error: '宿主还没配置模型:请先在 os 的设置页填写接口地址、API Key 和模型' });
                    return;
                }
                const result = await complete({
                    driver: settings.driver || config.driver || 'responses',
                    responsesUrl: settings.responsesUrl,
                    apiKey: settings.apiKey,
                    model: settings.model,
                    modelOptions: config.modelOptions,
                    retry: config.retry,
                    errorMaxChars: config.errorMaxChars,
                    instructions: String(input.instructions || '').slice(0, 4000),
                    input: [{ role: 'user', content: prompt.slice(0, 20_000) }],
                });
                json(response, 200, { text: result.text, usage: result.usage });
                return;
            }

            json(response, 404, { error: `宿主没有这个能力:${path}` });
        } catch (error) {
            json(response, error?.status || 500, { error: String(error?.message || error) });
        }
    };
}
