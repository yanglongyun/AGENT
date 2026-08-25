import http from 'node:http';
import { openDatabase, createStore } from './store.js';
import { createChannel } from './sse.js';
import { createRuns } from './runs.js';
import { createApi } from './api.js';
import { serveStatic } from './static.js';
import { createFiles } from './files.js';

export async function startDesktopServer({ config, uiRoot, version }) {
    const store = createStore(openDatabase(config.web.dataFile));
    const channel = createChannel();
    const files = createFiles(config);
    const runs = createRuns({ config, store, files, broadcast: channel.broadcast });
    const api = createApi({ config, store, runs, files, channel, meta: { version } });
    const server = http.createServer(async (request, response) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        try {
            if (await api(request, response, url)) return;
            if (request.method === 'GET' && serveStatic(uiRoot, url.pathname, response)) return;
            response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            response.end('Not found');
        } catch (error) {
            if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify({ error: String(error?.message || error) }));
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    return { url: `http://127.0.0.1:${address.port}`, close: () => { channel.close(); server.close(); } };
}
