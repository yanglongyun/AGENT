// /api/* 路由表。只做解析、校验和应答,业务在 store / turns / channel 里。
//
// 每个资源一个文件,导出 route(ctx):处理了返回 true,不是自己的返回 false。
// 这里按顺序问一遍,都不认就 404;抛出来的错统一按 error.status 应答。
import { json } from './helpers.js';
import { route as meta } from './meta.js';
import { route as apps } from './apps.js';
import { route as rules } from './rules.js';
import { route as proposals } from './proposals.js';
import { route as approvals } from './approvals.js';
import { route as files } from './files.js';
import { route as conversations } from './conversations.js';

const ROUTES = [meta, apps, rules, proposals, approvals, files, conversations];

export function createApi(deps) {
    /** 处理了返回 true;不是 /api 请求返回 false 交给静态层。 */
    return async function handle(request, response, url) {
        if (!url.pathname.startsWith('/api/')) return false;
        const ctx = {
            ...deps,
            request,
            response,
            url,
            method: request.method || 'GET',
            path: url.pathname,
            segments: url.pathname.split('/').filter(Boolean),
        };
        try {
            for (const route of ROUTES) if (await route(ctx)) return true;
            json(response, 404, { error: '接口不存在' });
        } catch (error) {
            json(response, error?.status || 500, { error: String(error?.message || error) });
        }
        return true;
    };
}
