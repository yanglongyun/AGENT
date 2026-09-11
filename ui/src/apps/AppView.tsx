// 一个 app 的容器:顶栏 + iframe。
//
// iframe 直连 app 自己的 origin(http://127.0.0.1:<port>)—— 每个 app 一个真 origin,
// 绝对路径天然成立,localStorage 互不可见。地址每次打开现取,不缓存:端口重启就变。
import { useEffect, useRef, useState } from 'react';

import { ThreadView } from '../thread';
import { createDraft } from '../thread/store';
import { AppMenu } from './AppMenu';
import { Icon } from '../icons/Icon';
import { Sheet } from '../overlay/Sheet';
import { toast } from '../overlay/toast';
import { useShell } from '../shell/layout';
import { appAddress, appLogs, appToken, useApps, type AppLog } from './store';

export function AppView() {
    const appId = useShell((state) => state.appId);
    const collapsed = useShell((state) => state.collapsed);
    const app = useApps((state) => state.apps.find((item) => item.id === appId));
    const [origin, setOrigin] = useState('');
    const [failure, setFailure] = useState('');
    const [logs, setLogs] = useState<AppLog[] | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const openedChat = useRef(false);
    const [nonce, setNonce] = useState(0);
    const frame = useRef<HTMLIFrameElement>(null);

    // 每次打开(或手动重载)都重新取址 —— 这就是懒启动的触发点
    useEffect(() => {
        if (!app) return;
        setOrigin('');
        setFailure('');
        let alive = true;
        appAddress(app.id)
            .then((data) => { if (alive) setOrigin(data.origin); })
            .catch((error) => { if (alive) setFailure((error as Error).message); });
        return () => { alive = false; };
    }, [app?.id, nonce]);

    // 打开期间每分钟摸一次:浏览器直连 app 的 origin,宿主看不到那些流量,
    // 但界面知道用户正看着 —— 别让正在用的 app 被当成闲置回收
    useEffect(() => {
        if (!app || !origin) return;
        const timer = setInterval(() => { void appAddress(app.id).catch(() => { /* 掉了下轮再说 */ }); }, 60_000);
        return () => clearInterval(timer);
    }, [app?.id, origin]);

    if (!app) return <div className="app-page"><div className="app-blank">应用不存在或已被移除</div></div>;

    const problem = failure || (app.status === 'invalid' || app.status === 'failed' ? app.error || '未知原因' : '');

    return (
        <div className="app-workspace">
        <div className="app-page">
            {/* 顶栏与对话页同一套 .topbar:同高同距,只是右侧多了 app 的操作 */}
            <header className="topbar">
                <button
                    className={`icon-btn menu-btn${collapsed ? ' show' : ''}`}
                    title="展开侧栏"
                    onClick={useShell.getState().openSidebar}
                ><Icon name="panel" size={17} /></button>
                <AppIcon id={app.id} name={app.name} hasIcon={app.hasIcon} size={18} />
                <span className="topbar-title clip">{app.name}</span>
                <span className="grow" />
                <button className={`icon-btn${chatOpen ? ' on' : ''}`} title="对话" aria-label="对话面板" aria-expanded={chatOpen} onClick={() => {
                    if (!openedChat.current) { createDraft(); openedChat.current = true; }
                    setChatOpen(!chatOpen);
                }}><Icon name="chat" size={18} /></button>
                <AppMenu app={app} origin={origin} reload={() => setNonce((n) => n + 1)} logs={() => { void appLogs(app.id).then(setLogs).catch((error) => toast(error.message)); }} />
            </header>

            {problem ? (
                <div className="app-blank">
                    <div className="app-blank-title">「{app.name}」现在跑不起来</div>
                    <div className="app-blank-note">{problem}</div>
                    {app.hasRun && (
                        <button className="btn btn-quiet" onClick={() => { void appLogs(app.id).then(setLogs); }}>查看日志</button>
                    )}
                </div>
            ) : app.status === 'stopped' && origin ? (
                // 手动停止或空闲回收之后:给明确的停止态,别留一个后端已死的 iframe
                <div className="app-blank">
                    <div className="app-blank-title">「{app.name}」已停止</div>
                    <button className="btn btn-accent" onClick={() => setNonce((n) => n + 1)}>启动</button>
                </div>
            ) : origin ? (
                // 真 origin 直连。不再需要 sandbox 压制:跨 origin 的 iframe 本来就
                // 碰不到宿主 DOM;localStorage 因 origin 不同而天然隔离。
                // allow 是契约的嵌入义务:跨源默认关掉的能力要放开,
                // 否则图片编辑器里 Ctrl+V 贴不进图,用户只会觉得 app 是坏的
                <iframe
                    key={`${app.id}:${nonce}`}
                    ref={frame}
                    className="app-frame"
                    src={origin}
                    title={app.name}
                    allow="clipboard-read; clipboard-write; fullscreen; pointer-lock"
                    onLoad={() => {
                        // 静态 app 没有后端持有环境变量,token 由这里定向递进去。
                        // targetOrigin 指定为 app 自己的 origin —— 递错了浏览器直接丢弃
                        void appToken(app.id).then(({ token }) => {
                            frame.current?.contentWindow?.postMessage(
                                { type: 'host.init', appId: app.id, token, hostUrl: location.origin },
                                origin,
                            );
                        }).catch(() => { /* 拿不到就不递,app 自己降级 */ });
                    }}
                />
            ) : (
                <div className="app-blank"><div className="app-blank-note">正在启动…</div></div>
            )}

            {logs && (
                <Sheet title={`${app.name} · 日志`} onClose={() => setLogs(null)}>
                    <div className="app-logs">
                        {logs.length
                            ? logs.map((entry, index) => <div key={index} className={`app-log ${entry.stream}`}>{entry.line}</div>)
                            : <div className="app-log">还没有输出</div>}
                    </div>
                </Sheet>
            )}
        </div>
        {chatOpen && <aside className="app-chat" aria-label="对话面板"><ThreadView panel onClose={() => setChatOpen(false)} /></aside>}
        </div>
    );
}

/** 图标:有 icon.svg/png 就用,没有就拿名字首字生成字母头像 —— 文件约定,不进 manifest。 */
export function AppIcon({ id, name, hasIcon, size = 16 }: { id: string; name: string; hasIcon: boolean; size?: number }) {
    if (hasIcon) return <img className="app-icon" src={`/api/apps/${id}/icon`} width={size} height={size} alt="" />;
    return <span className="app-icon letter" style={{ width: size, height: size, fontSize: size * 0.55 }}>{(name || id).slice(0, 1)}</span>;
}
