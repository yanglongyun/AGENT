// Web 服务入口:装配 store / 事件通道 / 运行编排 / 路由,只监听 127.0.0.1。
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from '../../config.js';
import { openDatabase, createStore } from './store.js';
import { createChannel } from './sse.js';
import { createRuns } from './runs.js';
import { createApi } from './api.js';
import { serveStatic } from './static.js';

const meta = {
    version: JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version,
};
const uiRoot = fileURLToPath(new URL('../ui/dist', import.meta.url));

const store = createStore(openDatabase(config.web.dataFile));
const channel = createChannel();
const runs = createRuns({ config, store, broadcast: channel.broadcast });
const api = createApi({ config, store, runs, channel, meta });

if (!config.apiKey || !config.model) {
    console.warn('[web] config.js 缺少 apiKey 或 model:界面可用,但无法运行 Agent。');
}

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    try {
        if (await api(request, response, url)) return;
        if (request.method === 'GET' && serveStatic(uiRoot, url.pathname, response)) return;
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    } catch (error) {
        if (!response.headersSent) {
            response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify({ error: String(error?.message || error) }));
        } else {
            response.end();
        }
    }
});

server.listen(config.web.port, config.web.host, () => {
    console.log(`AGENT Web: http://${config.web.host}:${config.web.port} (v${meta.version})`);
});

process.on('SIGINT', () => {
    channel.close();
    server.close();
    process.exit(0);
});
