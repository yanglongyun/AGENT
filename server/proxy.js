// /apps/:id/api/* → app 自己的子进程。宿主只转发,不理解 app 的协议。
import http from 'node:http';
import { applyCors, handlePreflight } from './cors.js';

const HOP_BY_HOP = new Set(['host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'upgrade']);

export function createProxy({ supervisor }) {
    return async function proxy(request, response, { app, path }) {
        if (handlePreflight(request, response)) return;

        let record;
        try {
            record = await supervisor.ensure(app.id);
        } catch (error) {
            applyCors(response);
            response.writeHead(error?.status || 503, { 'content-type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify({ error: `应用「${app.name}」的服务未能启动:${String(error?.message || error)}` }));
            return;
        }
        if (!record) {
            applyCors(response);
            response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify({ error: `应用「${app.name}」没有后端` }));
            return;
        }
        supervisor.touch(app.id);

        const headers = Object.fromEntries(Object.entries(request.headers).filter(([key]) => !HOP_BY_HOP.has(key)));
        const upstream = http.request(
            { host: '127.0.0.1', port: record.port, path, method: request.method, headers },
            (result) => {
                response.writeHead(result.statusCode || 502, { ...result.headers, 'access-control-allow-origin': '*' });
                result.pipe(response);
            },
        );
        upstream.on('error', (error) => {
            if (response.headersSent) { response.end(); return; }
            applyCors(response);
            response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify({ error: `转发失败:${error.message}` }));
        });
        request.pipe(upstream);
    };
}
