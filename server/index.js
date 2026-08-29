// Web 服务入口:装配 store / 事件通道 / 运行编排 / 路由,只监听 127.0.0.1。
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
import { openDatabase, createStore } from './store.js';
import { createChannel } from './sse.js';
import { createRuns } from './runs.js';
import { createApi } from './api.js';
import { serveStatic } from './static.js';
import { createFiles } from './files.js';
import { createApprovals } from './approvals.js';
import { createCompiler } from './compile.js';
import { createApps } from './apps.js';
import { createSupervisor } from './supervisor.js';
import { createProxy } from './proxy.js';
import { createBridge } from './bridge.js';

const meta = {
    version: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version,
};
const uiRoot = fileURLToPath(new URL('../ui/dist', import.meta.url));

const store = createStore(openDatabase(config.client.dataFile));
const channel = createChannel();
const files = createFiles(config);
const approvals = createApprovals({ broadcast: channel.broadcast, timeoutMs: config.client.approvalTimeoutMs });
const compileRule = createCompiler({ config, store });
const apps = createApps({ config, broadcast: channel.broadcast });
const supervisor = createSupervisor({ config, apps, broadcast: channel.broadcast });
const proxy = createProxy({ supervisor });
const bridge = createBridge({ config, store, supervisor });
const runs = createRuns({ config, store, files, approvals, apps, broadcast: channel.broadcast });
const api = createApi({ config, store, runs, files, channel, approvals, compileRule, apps, supervisor, meta });

const fail = (response, status, message) => {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: message }));
};

/**
 * /apps/:id/... 三条去向:
 *   host/*  回宿主(能力)
 *   api/*   出到子进程(app 自己的后端)
 *   其余     app 的 dist 静态
 */
async function routeApps(request, response, url) {
    if (!url.pathname.startsWith('/apps/')) return false;
    const segments = url.pathname.split('/').filter(Boolean);
    const id = segments[1];
    if (!id) return false;

    const app = apps.get(id);
    if (!app) { fail(response, 404, `没有这个应用:${id}`); return true; }
    const rest = segments.slice(2);

    if (rest[0] === 'host') {
        await bridge(request, response, { app, path: `/${rest.slice(1).join('/')}` });
        return true;
    }
    if (rest[0] === 'api') {
        await proxy(request, response, { app, path: url.pathname.slice(`/apps/${id}`.length) + url.search });
        return true;
    }
    // 少了尾斜杠,页面里所有相对路径都会打到 /apps/ 上 —— 先把地址摆正
    if (!rest.length && !url.pathname.endsWith('/')) {
        response.writeHead(308, { location: `/apps/${id}/` });
        response.end();
        return true;
    }
    if (app.invalid) { fail(response, 409, app.invalid); return true; }
    if (request.method === 'GET') {
        const sub = `/${rest.join('/')}`;
        if (serveStatic(app.distDir, sub, response)) { apps.markServed(id); return true; }
    }
    fail(response, 404, '文件不存在');
    return true;
}

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    try {
        if (await api(request, response, url)) return;
        if (await routeApps(request, response, url)) return;
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

// 监听失败的提示要放在 listen 前,EADDRINUSE 才不会以未捕获异常的形式炸出来。
server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
        console.error(`[agent] 端口 ${config.client.port} 被占用:先停掉旧进程再启动。`);
        process.exit(1);
    }
    throw error;
});

server.listen(config.client.port, config.client.host, () => {
    const installed = apps.list();
    console.log(`AGENT: http://${config.client.host}:${config.client.port} (v${meta.version})`);
    console.log(`[agent] 默认权限档:${config.client.defaultMode}`);
    console.log(`[agent] 应用目录 ${apps.root} —— 已装 ${installed.length} 个:${installed.map((app) => app.id).join(' ') || '(空)'}`);
    for (const app of installed.filter((item) => item.invalid)) console.warn(`[agent] ${app.id} 不可用:${app.invalid}`);
});

// ---- 平滑退出(SIGTERM / SIGINT 同一条路):消息不丢、状态不悬 ----
// 次序是有讲究的:
// 1) 先不再接新请求,顺手掐掉空闲的 keep-alive 连接;
// 2) 对还在跑的轮子发中止 —— work 的 catch 分支会补齐悬空 function_call、写停机留痕、保存上下文;
// 3) 全部收尾完才关 SSE 和残余连接。浏览器 EventSource 按 retry 自动重连新进程;
//    ngrok 只盯着 9500 这个端口,自始至终不动,隧道和公网地址因此保持不变。
const GRACE_MS = 8_000;
let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[agent] 收到 ${signal}:开始平滑退出`);

    server.close();
    server.closeIdleConnections?.();

    const running = runs.ids();
    if (running.length) {
        console.log(`[agent] 有 ${running.length} 个轮子在跑,等待收尾(最长 ${GRACE_MS / 1000} 秒)`);
        for (const id of running) runs.stop(id);
        const deadline = Date.now() + GRACE_MS;
        while (runs.ids().length > 0 && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const left = runs.ids().length;
        console.log(left ? `[agent] 仍有 ${left} 个未收尾,强制退出` : '[agent] 所有轮子已收尾入库');
    }

    // app 子进程是我们 spawn 的,就得由我们送走,否则端口和句柄都留在系统里
    await supervisor.stopAll();

    // 剩下挂着的多为 SSE 长连接,掐断正合适 —— 客户端会带着状态回来
    server.closeAllConnections?.();
    channel.close();
    process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// 常驻服务要有活着的底气:异常打日志继续跑,别让一次边界 bug 把整个服务带走。
// 数据层全部同步落库(SQLite),带病运行的窗口期也不会写坏任何东西。
process.on('uncaughtException', (error) => console.error('[agent] 未捕获异常:', error));
process.on('unhandledRejection', (reason) => console.error('[agent] 未处理的 Promise 拒绝:', reason));
