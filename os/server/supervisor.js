// app 子进程的生死:懒启动、健康判定、崩溃退避重启、空闲回收。
//
// 懒启动是刻意的 —— 装 20 个 app 不该等于开机 20 个 node 进程。
// 健康判定沿用 scripts/webctl.sh 的思路:起进程不算数,health 应答了才算数。
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import { resolve, join } from 'node:path';

const LOG_LINES = 200;
const MAX_RESTARTS = 3;
const IDLE_SWEEP_MS = 30_000;
const KILL_GRACE_MS = 5_000;

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
    const startTimeout = Number(config.os.appStartTimeoutMs) || 10_000;
    const hostUrl = `http://${config.os.host}:${config.os.port}`;

    /** 每个 app 一条记录。没有 server 的 app 也有,因为 token 与进程无关。 */
    function recordFor(id) {
        let record = records.get(id);
        if (!record) {
            record = {
                id,
                status: 'stopped',
                port: 0,
                token: randomBytes(24).toString('hex'),
                proc: null,
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

    async function waitHealthy(record, app) {
        const deadline = Date.now() + startTimeout;
        const url = `http://127.0.0.1:${record.port}${app.server.health}`;
        while (Date.now() < deadline) {
            if (!record.proc || record.proc.exitCode !== null) throw new Error(lastError(record) || '进程启动后立即退出');
            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
                if (response.ok) return;
            } catch { /* 还没起来,继续等 */ }
            await sleep(150);
        }
        throw new Error(`${startTimeout / 1000} 秒内没有通过健康检查(${app.server.health})`);
    }

    const lastError = (record) => record.logs.filter((entry) => entry.stream === 'stderr').slice(-3).map((entry) => entry.line).join(' / ');

    async function launch(app) {
        const record = recordFor(app.id);
        record.intentional = false;
        setStatus(record, 'starting');

        const dataDir = resolve(join(config.os.appDataDir, app.id));
        mkdirSync(dataDir, { recursive: true });
        record.port = await freePort();

        const child = spawn(app.server.command, app.server.args, {
            cwd: app.dir,
            env: {
                ...process.env,
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
        const child = record?.proc;
        if (!record || !child) { if (record) setStatus(record, 'stopped'); return false; }
        record.intentional = true;
        child.kill('SIGTERM');
        const deadline = Date.now() + KILL_GRACE_MS;
        while (record.proc && Date.now() < deadline) await sleep(100);
        if (record.proc) child.kill('SIGKILL');
        setStatus(record, 'stopped');
        return true;
    }

    // 空闲回收:超过 idleTimeoutMs 没人用就让它睡,下次点开再拉起来
    const sweep = setInterval(() => {
        for (const record of records.values()) {
            if (record.status !== 'ready') continue;
            const app = apps.get(record.id);
            const idle = app?.server?.idleTimeoutMs || 0;
            if (idle > 0 && Date.now() - record.lastUsed > idle) void stop(record.id);
        }
    }, IDLE_SWEEP_MS);
    sweep.unref?.();

    return {
        /** app 作用域凭证。与进程无关 —— 纯前端 app 也要能调宿主能力。 */
        tokenFor: (id) => recordFor(id).token,
        verify(id, token) {
            const record = records.get(id);
            return Boolean(record && token && token === record.token);
        },

        /** 保证子进程可用;没有 server 的 app 返回 null。抛错即启动失败。 */
        async ensure(id) {
            const app = apps.get(id);
            if (!app) throw Object.assign(new Error(`没有这个应用:${id}`), { status: 404 });
            if (app.invalid) throw Object.assign(new Error(app.invalid), { status: 409 });
            if (!app.server) return null;

            const record = recordFor(id);
            record.lastUsed = Date.now();
            if (record.status === 'ready' && record.proc) return record;
            if (record.starting) return record.starting;

            record.restarts = 0;
            record.starting = launch(app).finally(() => { record.starting = null; });
            return record.starting;
        },

        touch(id) { const record = records.get(id); if (record) record.lastUsed = Date.now(); },
        stop,
        async restart(id) { await stop(id); return this.ensure(id); },
        logs: (id) => records.get(id)?.logs || [],
        status(id) {
            const app = apps.get(id);
            if (app && !app.server) return { status: app.invalid ? 'invalid' : 'static', error: app.invalid || '' };
            const record = records.get(id);
            if (app?.invalid) return { status: 'invalid', error: app.invalid };
            return { status: record?.status || 'stopped', error: record?.error || '' };
        },
        async stopAll() {
            clearInterval(sweep);
            await Promise.all([...records.keys()].map((id) => stop(id)));
        },
    };
}
