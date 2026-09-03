// Web 服务入口:装配 store / 事件通道 / 运行编排 / 路由,只监听 127.0.0.1。
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
import { openDatabase, createStore } from './store.js';
import { createChannel } from './http/sse.js';
import { createTurns } from './run/turn.js';
import { createApi } from './api/index.js';
import { serveStatic } from './http/static.js';
import { createFiles } from './run/files.js';
import { createApprovals } from './run/approvals.js';
import { createApps } from './apps/registry.js';
import { createSupervisor } from './apps/supervisor.js';
import { createBridge } from './apps/bridge.js';
import { SEED_RULES } from './run/rules.js';

const meta = {
    version: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version,
};
const uiRoot = fileURLToPath(new URL('../ui/dist', import.meta.url));

const store = createStore(openDatabase(config.dataFile));
const channel = createChannel();
const files = createFiles(config);
const approvals = createApprovals({ broadcast: channel.broadcast, timeoutMs: config.approvalTimeoutMs });
const apps = createApps({ config, broadcast: channel.broadcast });
const supervisor = createSupervisor({ config, apps, broadcast: channel.broadcast });
const bridge = createBridge({ config, store, apps, supervisor, channel });
const turns = createTurns({ config, store, files, approvals, apps, broadcast: channel.broadcast });
const api = createApi({ config, store, turns, files, channel, approvals, apps, supervisor, meta });

// 出厂规则只铺一次。铺完就是普通规则,删了不复活
if (!store.getSettings().rulesSeeded) {
    for (const text of SEED_RULES) store.createRule({ id: crypto.randomUUID(), text });
    store.setSettings({ rulesSeeded: '1' });
}

const fail = (response, status, message) => {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: message }));
};

const SELF_ORIGINS = new Set([
    `http://${config.host}:${config.port}`,
    `http://localhost:${config.port}`,
]);
const SELF_HOSTS = new Set([`${config.host}:${config.port}`, `localhost:${config.port}`]);

/**
 * 内部面(/api/*)只服务宿主自己的界面。挡两类来自浏览器的越权:
 *   跨源请求  别的网页(含 app 的 iframe)对 127.0.0.1 发 fetch —— Origin 对不上就拒
 *   DNS 重绑  外部域名解析到 127.0.0.1 —— Host 头对不上就拒
 * 这挡不住本机进程伪造头(那要 UI 会话密钥,见契约的已知限制),但把「开着宿主
 * 逛网页就可能被驱动」这条路封死了。反代部署时把代理设为保留 Host 即可。
 */
function crossOriginBlocked(request, response, url) {
    if (!url.pathname.startsWith('/api/')) return false;
    const origin = request.headers.origin;
    const host = request.headers.host || '';
    const foreign = (origin && !SELF_ORIGINS.has(origin)) || (host && !SELF_HOSTS.has(host));
    if (!foreign) return false;
    response.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: '内部接口只服务宿主自己的界面' }));
    return true;
}

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    try {
        if (crossOriginBlocked(request, response, url)) return;
        if (await api(request, response, url)) return;
        // 契约面:app 凭 token 调宿主能力。token 即身份,路径里没有 app id
        if (url.pathname.startsWith('/host/')) { await bridge(request, response, url.pathname.slice('/host'.length)); return; }
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
        console.error(`[agent] 端口 ${config.port} 被占用:先停掉旧进程再启动。`);
        process.exit(1);
    }
    throw error;
});

server.listen(config.port, config.host, () => {
    const installed = apps.list();
    console.log(`AGENT: http://${config.host}:${config.port} (v${meta.version})`);
    console.log(`[agent] 规则:${(store.getSettings().rulesEnabled || 'on') === 'on' ? '启用' : '停用'},${store.listRules().length} 条`);
    console.log(`[agent] 应用目录 ${apps.root} —— 已装 ${installed.length} 个:${installed.map((app) => app.id).join(' ') || '(空)'}`);
    for (const app of installed.filter((item) => item.invalid)) console.warn(`[agent] ${app.id} 不可用:${app.invalid}`);
    // run.mode: "always" 的启动组
    void supervisor.startAlways().then((ids) => {
        if (ids.length) console.log(`[agent] 常驻应用已拉起:${ids.join(' ')}`);
    });
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

    const running = turns.ids();
    if (running.length) {
        console.log(`[agent] 有 ${running.length} 个轮子在跑,等待收尾(最长 ${GRACE_MS / 1000} 秒)`);
        for (const id of running) turns.stop(id);
        const deadline = Date.now() + GRACE_MS;
        while (turns.ids().length > 0 && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const left = turns.ids().length;
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
