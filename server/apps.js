// app 注册表:扫描 apps/*、读 manifest、校验、给 AI 拼常驻清单。
//
// 每次问都重扫 —— 十几个小 JSON 的开销可以忽略,换来的是 AI 刚写完一个 app、
// 刷新页面就出现在侧边栏,不需要重启宿主。
import { existsSync, readdirSync, readFileSync, statSync, watch } from 'node:fs';
import { join, resolve } from 'node:path';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const DEFAULT_HEALTH = '/health';
const DEFAULT_IDLE_MS = 600_000;

const asString = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback);

export function createApps({ config, broadcast = () => {} }) {
    const root = resolve(config.client.appsDir);
    // 页面被真正取走的时刻。宿主界面据此判断 iframe 是不是被浏览器拦了 ——
    // 被拦的框架照样会触发 load 事件,前端信号靠不住,服务端这一笔才作数。
    const served = new Map();

    /** 读一个目录,永远返回一条记录 —— 坏 app 也要能在侧边栏里看见原因。 */
    function readOne(id) {
        const dir = join(root, id);
        const manifestFile = join(dir, 'manifest.json');
        const base = { id, dir, name: id, icon: '📦', version: '', description: '', permissions: [], server: null, sidebar: { order: 100, hidden: false }, hasDoc: existsSync(join(dir, 'APP.md')), invalid: '' };

        if (!ID_PATTERN.test(id)) return { ...base, invalid: '目录名只能是小写字母、数字和连字符' };
        if (!existsSync(manifestFile)) return null; // 不是 app,静默跳过

        let raw;
        try { raw = JSON.parse(readFileSync(manifestFile, 'utf8')); } catch (error) {
            return { ...base, invalid: `manifest.json 解析失败:${String(error?.message || error)}` };
        }
        if (asString(raw.id) !== id) return { ...base, invalid: `manifest.id(${asString(raw.id) || '空'})与目录名不一致` };

        const entry = asString(raw.entry, 'dist/index.html');
        const entryFile = resolve(dir, entry);
        // 目录穿越挡在这儿:entry 只能指向 app 自己的目录内
        if (!entryFile.startsWith(`${dir}/`)) return { ...base, invalid: 'entry 越出了 app 目录' };

        const manifest = {
            ...base,
            name: asString(raw.name) || id,
            icon: asString(raw.icon) || '📦',
            version: asString(raw.version),
            description: asString(raw.description),
            entry,
            entryFile,
            distDir: resolve(dir, entry, '..'),
            permissions: Array.isArray(raw.permissions) ? raw.permissions.map(String) : [],
            sidebar: {
                order: Number(raw.sidebar?.order) || 100,
                hidden: raw.sidebar?.hidden === true,
            },
            server: null,
        };

        if (raw.server && asString(raw.server.command)) {
            manifest.server = {
                command: asString(raw.server.command),
                args: Array.isArray(raw.server.args) ? raw.server.args.map(String) : [],
                health: asString(raw.server.health) || DEFAULT_HEALTH,
                idleTimeoutMs: Number(raw.server.idleTimeoutMs) || Number(config.client.appIdleTimeoutMs) || DEFAULT_IDLE_MS,
            };
        }

        // dist 缺失是最常见的故障:app 写完了但没构建。说清楚,别让用户对着白屏猜
        if (!existsSync(entryFile)) manifest.invalid = `${entry} 不存在 —— 这个 app 还没构建`;
        return manifest;
    }

    function scan() {
        if (!existsSync(root)) return [];
        return readdirSync(root)
            .filter((name) => !name.startsWith('.') && statSync(join(root, name)).isDirectory())
            .map(readOne)
            .filter(Boolean)
            .sort((a, b) => a.sidebar.order - b.sidebar.order || a.name.localeCompare(b.name, 'zh'));
    }

    // 目录一变就通知界面。非递归就够:新 app 一定是新建一个子目录
    if (existsSync(root)) {
        let timer = null;
        try {
            watch(root, { persistent: false }, () => {
                clearTimeout(timer);
                timer = setTimeout(() => broadcast('apps.changed', {}), 250);
            });
        } catch { /* 某些文件系统不支持 watch,退化成刷新页面才更新 */ }
    }

    return {
        root,
        list: scan,
        get: (id) => scan().find((app) => app.id === id) || null,
        markServed: (id) => served.set(id, Date.now()),
        servedAt: (id) => served.get(id) || 0,

        readDoc(id) {
            const file = join(root, id, 'APP.md');
            try { return readFileSync(file, 'utf8'); } catch { return ''; }
        },

        /**
         * 常驻提示词。只放 description 一行 —— 正文让 AI 自己用 read 工具展开,
         * 这是 SKILL.md 那套 progressive disclosure,20 个 app 也吃不掉上下文。
         */
        promptSection() {
            const apps = scan().filter((app) => !app.invalid && !app.sidebar.hidden);
            const lines = apps.map((app) => `- ${app.id}(${app.name}):${app.description || '无说明'} —— 细节见 ${config.client.appsDir}/${app.id}/APP.md`);
            const broken = scan().filter((app) => app.invalid);
            if (broken.length) {
                lines.push(...broken.map((app) => `- ${app.id}:【故障】${app.invalid}`));
            }
            if (!lines.length) return '';
            return [
                '## 已安装的应用',
                '这些 app 装在侧边栏里,用户可以点开使用:',
                ...lines,
                '',
                `新建 app:在 ${config.client.appsDir}/<id>/ 下建 manifest.json、APP.md、src/ 和构建产物 dist/index.html,`,
                '构建由你用 bash 工具跑(宿主不负责构建),完成后自动出现在侧边栏。',
            ].join('\n');
        },
    };
}
