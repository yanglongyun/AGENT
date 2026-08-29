// 一个 app 的容器:顶栏 + iframe。
//
// iframe 默认不给 allow-same-origin,里面是不透明源 —— 碰不到宿主 DOM 和 cookie。
// 代价是 app 用不了 localStorage,这与「状态归 app 自己的 SQLite」本就一致。
// 凭证走 postMessage 握手,不进 URL:URL 会落进日志和浏览历史。
import { useEffect, useRef, useState } from 'react';

import { Icon } from '../icons/Icon';
import { Sheet } from '../overlay/Sheet';
import { toast } from '../overlay/toast';
import { useShell } from '../shell/layout';
import { appLogs, appServedAt, appToken, restartApp, useApps, type AppLog } from './store';

const LABEL: Record<string, string> = {
    ready: '运行中', starting: '启动中', stopped: '已停止',
    failed: '故障', static: '纯前端', invalid: '不可用',
};

/**
 * 被扩展拦掉的 iframe 照样会触发 load 事件,所以判活不能问前端 —— 问服务端:
 * 这段时间里 app 的页面到底有没有被取走过。
 */
const STALL_MS = 3_500;

export function AppView() {
    const appId = useShell((state) => state.appId);
    const app = useApps((state) => state.apps.find((item) => item.id === appId));
    const sandbox = useApps((state) => state.sandbox);
    const frame = useRef<HTMLIFrameElement>(null);
    const [logs, setLogs] = useState<AppLog[] | null>(null);
    const [nonce, setNonce] = useState(0);
    const [stalled, setStalled] = useState(false);

    // 握手:iframe 说 os.ready,宿主校验来源后回 os.init 带上 token。
    // targetOrigin 只能是 '*' —— 对方是不透明源,没有具体 origin 可写。
    useEffect(() => {
        if (!app) return;
        const onMessage = async (event: MessageEvent) => {
            if (!frame.current || event.source !== frame.current.contentWindow) return;
            if ((event.data as { type?: string })?.type !== 'os.ready') return;
            const token = await appToken(app.id).catch(() => '');
            frame.current.contentWindow?.postMessage({
                type: 'os.init',
                appId: app.id,
                token,
                theme: document.documentElement.dataset.theme || 'light',
            }, '*');
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [app?.id]);

    useEffect(() => {
        if (!app) return;
        setStalled(false);
        const openedAt = Date.now();
        const timer = setTimeout(async () => {
            const at = await appServedAt(app.id).catch(() => Date.now());
            setStalled(at < openedAt);
        }, STALL_MS);
        return () => clearTimeout(timer);
    }, [app?.id, nonce]);

    if (!app) return <div className="app-page"><div className="app-blank">应用不存在或已被移除</div></div>;

    const broken = app.status === 'invalid' || app.status === 'failed';
    const href = `/apps/${app.id}/`;

    return (
        <div className="app-page">
            <header className="app-bar">
                <button className="icon-btn only-narrow" title="菜单" onClick={useShell.getState().openSidebar}>
                    <Icon name="panel" size={16} />
                </button>
                <span className="app-bar-icon">{app.icon}</span>
                <span className="app-bar-name clip">{app.name}</span>
                <span className={`app-pill ${app.status}`}>{LABEL[app.status] || app.status}</span>
                <span className="grow" />
                {app.hasServer && (<>
                    <button
                        className="icon-btn" title="重启后端"
                        onClick={() => { void restartApp(app.id).then(() => { setNonce((n) => n + 1); toast(`已重启「${app.name}」`); }); }}
                    ><Icon name="compose" size={15} /></button>
                    <button
                        className="icon-btn" title="查看后端日志"
                        onClick={() => { void appLogs(app.id).then(setLogs); }}
                    ><Icon name="terminal" size={15} /></button>
                </>)}
                <a className="icon-btn" title="在新标签页打开" href={href} target="_blank" rel="noopener noreferrer">
                    <Icon name="external" size={15} />
                </a>
            </header>

            {broken ? (
                <div className="app-blank">
                    <div className="app-blank-title">「{app.name}」现在跑不起来</div>
                    <div className="app-blank-note">{app.error || '未知原因'}</div>
                    {app.hasServer && (
                        <button className="btn btn-quiet" onClick={() => { void appLogs(app.id).then(setLogs); }}>查看日志</button>
                    )}
                </div>
            ) : (
                <div className="app-stage">
                    <iframe
                        key={`${app.id}:${nonce}`}
                        ref={frame}
                        className="app-frame"
                        src={href}
                        sandbox={sandbox}
                        title={app.name}
                    />
                    {stalled && (
                        <div className="app-stall">
                            <div className="app-blank-title">页面没有载入</div>
                            <div className="app-blank-note">
                                当前浏览器把沙箱 iframe(不透明源)拦掉了 —— 这是浏览器扩展或内嵌预览器的注入策略,
                                不是这个应用的问题。可以直接在新标签页打开它;
                                若要让它在此处内嵌显示,在 config.js 的 <code>os.appSandbox</code> 里加上
                                <code>allow-same-origin</code> 放宽隔离。
                            </div>
                            <a className="btn btn-quiet" href={href} target="_blank" rel="noopener noreferrer">在新标签页打开</a>
                        </div>
                    )}
                </div>
            )}

            {logs && (
                <Sheet title={`${app.name} · 后端日志`} onClose={() => setLogs(null)}>
                    <div className="app-logs">
                        {logs.length
                            ? logs.map((entry, index) => (
                                <div key={index} className={`app-log ${entry.stream}`}>{entry.line}</div>
                            ))
                            : <div className="app-log">还没有输出</div>}
                    </div>
                </Sheet>
            )}
        </div>
    );
}
