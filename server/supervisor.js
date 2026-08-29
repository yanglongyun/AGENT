// app 子进程的生死:启动、健康判定、崩溃退避重启、空闲回收。
//
// 两种 run.mode:
//   on-demand  取址时才起,闲了回收(懒启动 —— 装 20 个 app 不等于开机 20 个进程)
//   always     随宿主启动,崩了重启,不做空闲回收
// 纯静态 app(无 run)也在这里管:给它起一个极小的静态服务 ——
// 每个 app 一个真 origin,无例外,否则它写 /style.css 这种绝对路径一样炸。
//
// 健康判定沿用 scripts/webctl.sh 的思路:起进程不算数,health 应答了才算数。
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { extname, join, resolve } from 'node:path';

const LOG_LINES = 200;
const MAX_RESTARTS = 3;
const IDLE_SWEEP_MS = 30_000;
const KILL_GRACE_MS = 5_000;

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

/** 让内核挑一个空闲端口,拿到号再让开。存在理论竞态,拿不到就由启动失败兜住。 */
function freePort() {
    return new Promise((done, fail) => {
        const probe = net.createServer();
        probe.unref();
        probe.on('error', fail);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close(() => done(port));
        });
    });
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export function createSupervisor({ config, apps, broadcast = () => {} }) {
    const records = new Map();
    const startTimeout = Number(config.client.appStartTimeoutMs) || 10_000;
    const hostUrl = `http://${config.client.host}:${config.client.port}`;

    function recordFor(id) {
        let record = records.get(id);
        if (!record) {
            record = {
                id,
                status: 'stopped',
                port: 0,
                token: randomBytes(24).toString('hex'),
                proc: null,          // 子进程,或静态 app 的 http.Server
                kind: 'process',
                logs: [],
                error: '',
                restarts: 0,
                lastUsed: Date.now(),
                starting: null,
                intentional: false,
            };
            records.set(id, record);
        }
        return record;
    }

    function setStatus(record, status, error = '') {
        record.status = status;
        record.error = error;
        broadcast('app.status', { appId: record.id, status, error, port: record.port });
    }

    function log(record, stream, chunk) {
        for (const line of String(chunk).split('\n')) {
            if (!line.trim()) continue;
            record.logs.push({ stream, line: line.slice(0, 2000), at: new Date().toISOString() });
        }
        if (record.logs.length > LOG_LINES) record.logs.splice(0, record.logs.length - LOG_LINES);
    }

    const lastError = (record) => record.logs.filter((entry) => entry.stream === 'stderr').slice(-3).map((entry) => entry.line).join(' / ');

    async function waitHealthy(record, app) {
        const deadline = Date.now() + startTimeout;
        const url = `http://127.0.0.1:${record.port}${app.run.health}`;
        while (Date.now() < deadline) {
            if (!record.proc || record.proc.exitCode !== null) throw new Error(lastError(record) || '进程启动后立即退出');
            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
                if (response.ok) return;
            } catch { /* 还没起来,继续等 */ }
            await sleep(150);
        }
        throw new Error(`${startTimeout / 1000} 秒内没有通过健康检查(${app.run.health})`);
    }

    /** 纯静态 app:宿主替它当那个「网站」。目录根即站点根,未命中回落 index.html。 */
    function launchStatic(app, record) {
        return new Promise((done, fail) => {
            const server = http.createServer((request, response) => {
                record.lastUsed = Date.now();
                const pathname = decodeURIComponent(new URL(request.url || '/', 'http://x').pathname);
                const base = resolve(app.dir);
                let file = resolve(base, `.${pathname}`);
                if (!file.startsWith(base) || !existsSync(file) || statSync(file).isDirectory()) file = join(base, 'index.html');
                if (!existsSync(file)) { response.writeHead(404); response.end(); return; }
                response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
                createReadStream(file).pipe(response);
            });
            server.on('error', fail);
            server.listen(0, '127.0.0.1', () => {
                record.port = server.address().port;
                record.proc = server;
                record.kind = 'static';
                record.restarts = 0;
                setStatus(record, 'ready');
                done(record);
            });
        });
    }

    async function launch(app) {
        const record = recordFor(app.id);
        record.intentional = false;
        setStatus(record, 'starting');

        if (!app.run) return launchStatic(app, record);

        const dataDir = resolve(join(config.client.appDataDir, app.id));
        mkdirSync(dataDir, { recursive: true });
        record.port = await freePort();
        record.kind = 'process';

        const child = spawn(app.run.command, app.run.args, {
            cwd: app.dir,
            // 白名单,不是 ...process.env —— 用户 shell 里 export 的密钥
            // 没有理由全量遗传给每个 app;app 要什么,契约里写明的就这几个
            env: {
                PATH: process.env.PATH || '',
                HOME: process.env.HOME || '',
                TMPDIR: process.env.TMPDIR || '',
                LANG: process.env.LANG || '',
                TZ: process.env.TZ || '',
                PORT: String(record.port),
                APP_ID: app.id,
                APP_DATA_DIR: dataDir,
                HOST_URL: hostUrl,
                APP_TOKEN: record.token,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        record.proc = child;
        child.stdout.on('data', (chunk) => log(record, 'stdout', chunk));
        child.stderr.on('data', (chunk) => log(record, 'stderr', chunk));
        child.on('error', (error) => log(record, 'stderr', `spawn 失败:${error.message}`));
        child.on('exit', (code, signal) => void onExit(app, record, code, signal));

        try {
            await waitHealthy(record, app);
            record.restarts = 0;
            record.lastUsed = Date.now();
            setStatus(record, 'ready');
        } catch (error) {
            record.intentional = true;
            child.kill('SIGKILL');
            record.proc = null;
            setStatus(record, 'failed', String(error?.message || error));
            throw error;
        }
        return record;
    }

    /** 非预期退出才重启。退避 1s / 2s / 4s,连续三次仍不行就认输。 */
    async function onExit(app, record, code, signal) {
        record.proc = null;
        if (record.intentional) { setStatus(record, 'stopped'); return; }
        log(record, 'stderr', `进程退出(code=${code} signal=${signal || '-'})`);
        if (record.restarts >= MAX_RESTARTS) {
            setStatus(record, 'failed', `连续 ${MAX_RESTARTS} 次崩溃,已停止重启。${lastError(record)}`);
            return;
        }
        const delay = 1000 * 2 ** record.restarts;
        record.restarts += 1;
        setStatus(record, 'starting', `第 ${record.restarts} 次重启,等待 ${delay / 1000}s`);
        await sleep(delay);
        if (record.intentional) return;
        record.starting = launch(app).finally(() => { record.starting = null; });
        await record.starting.catch(() => { /* launch 里已记状态 */ });
    }

    async function stop(id) {
        const record = records.get(id);
        if (!record?.proc) { if (record) setStatus(record, 'stopped'); return false; }
        record.intentional = true;
        if (record.kind === 'static') {
            record.proc.close();
            record.proc = null;
            setStatus(record, 'stopped');
            return true;
        }
        const child = record.proc;
        child.kill('SIGTERM');
        const deadline = Date.now() + KILL_GRACE_MS;
        while (record.proc && Date.now() < deadline) await sleep(100);
        if (record.proc) child.kill('SIGKILL');
        setStatus(record, 'stopped');
        return true;
    }

    async function ensure(id) {
        const app = apps.get(id);
        if (!app) throw Object.assign(new Error(`没有这个应用:${id}`), { status: 404 });
        if (app.invalid) throw Object.assign(new Error(app.invalid), { status: 409 });

        const record = recordFor(id);
        record.lastUsed = Date.now();
        if (record.status === 'ready' && record.proc) return record;
        if (record.starting) return record.starting;

        record.restarts = 0;
        record.starting = launch(app).finally(() => { record.starting = null; });
        return record.starting;
    }

    // 空闲回收:只回收 on-demand。always 与静态服务不回收(后者只是个句柄,不值得省)
    const sweep = setInterval(() => {
        for (const record of records.values()) {
            if (record.status !== 'ready' || record.kind !== 'process') continue;
            const app = apps.get(record.id);
            if (!app?.run || app.run.mode === 'always') continue;
            const idle = app.run.idleTimeoutMs || 0;
            if (idle > 0 && Date.now() - record.lastUsed > idle) void stop(record.id);
        }
    }, IDLE_SWEEP_MS);
    sweep.unref?.();

    return {
        /** app 作用域凭证。与进程无关 —— 纯静态 app 也要能调宿主能力。 */
        tokenFor: (id) => recordFor(id).token,
        verify(id, token) {
            const record = records.get(id);
            return Boolean(record && token && token === record.token);
        },
        /** 反查:token → appId。契约面 /host/* 靠它认身份,路径里不再有 :id。 */
        identify(token) {
            if (!token) return '';
            for (const record of records.values()) if (record.token === token) return record.id;
            return '';
        },

        ensure,
        touch(id) { const record = records.get(id); if (record) record.lastUsed = Date.now(); },
        stop,
        async restart(id) { await stop(id); return ensure(id); },
        logs: (id) => records.get(id)?.logs || [],
        status(id) {
            const app = apps.get(id);
            if (app?.invalid) return { status: 'invalid', error: app.invalid };
            const record = records.get(id);
            return { status: record?.status || 'stopped', error: record?.error || '' };
        },

        /** run.mode: "always" 的启动组 —— 宿主起来时把它们全拉起。 */
        async startAlways() {
            const eager = apps.list().filter((app) => app.run?.mode === 'always' && !app.invalid);
            await Promise.all(eager.map((app) => ensure(app.id).catch(() => { /* 状态已记录 */ })));
            return eager.map((app) => app.id);
        },
        async stopAll() {
            clearInterval(sweep);
            await Promise.all([...records.keys()].map((id) => stop(id)));
        },
    };
}
