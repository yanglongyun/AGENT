// confirm 的问询:刷新页面要能把还悬着的卡捞回来;用户表态走 POST。
import { json, readBody } from './helpers.js';

export async function route({ method, path, segments, url, request, response, approvals }) {
    if (method === 'GET' && path === '/api/approvals') {
        json(response, 200, { approvals: approvals.listFor(url.searchParams.get('conversationId') || '') });
        return true;
    }
    if (method === 'POST' && segments[1] === 'approvals' && segments[2]) {
        const input = await readBody(request);
        json(response, 200, { settled: approvals.respond(segments[2], input.answer) });
        return true;
    }
    return false;
}
