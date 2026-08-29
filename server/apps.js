// app 注册表:扫描 apps/*、读 manifest、校验、给 AI 拼常驻清单。
//
// 每次问都重扫 —— 十几个小 JSON 的开销可以忽略,换来的是 AI 刚写完一个 app、
// 刷新页面就出现在侧边栏,不需要重启宿主。
//
// manifest 只声明宿主必须知道的事实(契约见仓库根 SPEC.md):
// 排序等用户偏好归宿主存,图标是文件约定(icon.svg / icon.png),地址是运行时事实。
import { existsSync, readdirSync, readFileSync, statSync, watch } from 'node:fs';
import { join, resolve } from 'node:path';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const DEFAULT_HEALTH = '/health';
const RUN_MODES = ['on-demand', 'always'];

const asString = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback);

export function createApps({ config, broadcast = () => {} }) {
    const root = resolve(config.client.appsDir);

    /** 读一个目录,永远返回一条记录 —— 坏 app 也要能在侧边栏里看见原因。 */
    function readOne(id) {
        const dir = join(root, id);
        const manifestFile = join(dir, 'manifest.json');
        const iconFile = ['icon.svg', 'icon.png'].map((name) => join(dir, name)).find(existsSync) || '';
        const base = {
            id, dir, name: id, version: '', description: '',
            iconFile, permissions: [], run: null,
            hasDoc: existsSync(join(dir, 'APP.md')), invalid: '',
        };

        if (!ID_PATTERN.test(id)) return { ...base, invalid: '目录名只能是小写字母、数字和连字符' };
        if (!existsSync(manifestFile)) return null; // 不是 app,静默跳过

        let raw;
        try { raw = JSON.parse(readFileSync(manifestFile, 'utf8')); } catch (error) {
            return { ...base, invalid: `manifest.json 解析失败:${String(error?.message || error)}` };
        }
        if (asString(raw.id) !== id) return { ...base, invalid: `manifest.id(${asString(raw.id) || '空'})与目录名不一致` };
        // 契约主版本:不认识的按无效处理,不猜 —— 猜错的行为比明确拒绝更难排查
        const contract = raw.contract === undefined ? 1 : Number(raw.contract);
        if (contract !== 1) return { ...base, invalid: `需要契约版本 ${raw.contract},本宿主只实现版本 1` };

        const manifest = {
            ...base,
            name: asString(raw.name) || id,
            version: asString(raw.version),
            description: asString(raw.description),
            permissions: Array.isArray(raw.permissions) ? raw.permissions.map(String) : [],
        };

        if (raw.run && asString(raw.run.command)) {
            const mode = asString(raw.run.mode, 'on-demand');
            if (!RUN_MODES.includes(mode)) return { ...manifest, invalid: `run.mode 只能是 ${RUN_MODES.join(' / ')}` };
            manifest.run = {
                command: asString(raw.run.command),
                args: Array.isArray(raw.run.args) ? raw.run.args.map(String) : [],
                health: asString(raw.run.health) || DEFAULT_HEALTH,
                mode,
                idleTimeoutMs: Number(config.client.appIdleTimeoutMs) || 600_000,
            };
        } else if (!existsSync(join(dir, 'index.html'))) {
            // 纯静态 app 的约定:目录根就是站点根
            manifest.invalid = '没有 run 也没有 index.html —— 这个目录还不是一个 app';
        }
        return manifest;
    }

    function scan() {
        if (!existsSync(root)) return [];
        return readdirSync(root)
            .filter((name) => !name.startsWith('.') && statSync(join(root, name)).isDirectory())
            .map(readOne)
            .filter(Boolean)
            .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
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
        readDoc(id) {
            const file = join(root, id, 'APP.md');
            try { return readFileSync(file, 'utf8'); } catch { return ''; }
        },

        /**
         * 常驻提示词。只放 description 一行 + 取址约定 —— 端口会过期,约定不会。
         * 正文让 AI 自己用 read 工具展开(SKILL.md 那套 progressive disclosure)。
         */
        promptSection() {
            const apps = scan().filter((app) => !app.invalid);
            const lines = apps.map((app) => `- ${app.id}(${app.name}):${app.description || '无说明'} —— API 见 ${config.client.appsDir}/${app.id}/APP.md`);
            const broken = scan().filter((app) => app.invalid);
            if (broken.length) lines.push(...broken.map((app) => `- ${app.id}:【故障】${app.invalid}`));
            if (!lines.length) return '';
            const hostBase = `http://${config.client.host}:${config.client.port}`;
            return [
                '## 已安装的应用',
                'app 是带界面的本地网站,用户在侧边栏点开;你也可以直接调它的 HTTP API:',
                ...lines,
                '',
                `调用方式:先取址 \`curl ${hostBase}/api/apps/<id>/address\`(会顺手把没起的 app 拉起,`,
                '返回 { origin }),再对着 origin 调 APP.md 里写的接口。**地址每次现取,不要缓存端口。**',
                `新建 app:在 ${config.client.appsDir}/<id>/ 下按仓库根 SPEC.md 的契约建目录,`,
                '最小只要 manifest.json 和一个监听 PORT 的 server;写完自动出现在侧边栏。',
            ].join('\n');
        },
    };
}
