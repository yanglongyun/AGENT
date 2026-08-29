// 一个 app 的容器:顶栏 + iframe。
//
// iframe 直连 app 自己的 origin(http://127.0.0.1:<port>)—— 每个 app 一个真 origin,
// 绝对路径天然成立,localStorage 互不可见。地址每次打开现取,不缓存:端口重启就变。
import { useEffect, useState } from 'react';

import { Icon } from '../icons/Icon';
import { Sheet } from '../overlay/Sheet';
import { toast } from '../overlay/toast';
import { useShell } from '../shell/layout';
import { appAddress, appLogs, restartApp, stopApp, useApps, type AppLog } from './store';

const LABEL: Record<string, string> = {
    ready: '运行中', starting: '启动中', stopped: '已停止', failed: '故障', invalid: '不可用',
};

export function AppView() {
    const appId = useShell((state) => state.appId);
    const collapsed = useShell((state) => state.collapsed);
    const app = useApps((state) => state.apps.find((item) => item.id === appId));
    const [origin, setOrigin] = useState('');
    const [failure, setFailure] = useState('');
    const [logs, setLogs] = useState<AppLog[] | null>(null);
    const [nonce, setNonce] = useState(0);

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

    if (!app) return <div className="app-page"><div className="app-blank">应用不存在或已被移除</div></div>;

    const running = app.status === 'ready' || app.status === 'starting';
    const problem = failure || (app.status === 'invalid' || app.status === 'failed' ? app.error || '未知原因' : '');

    return (
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
                <span className={`app-pill ${app.status}`}>{LABEL[app.status] || app.status}</span>
                {app.runMode === 'always' && <span className="app-pill always" title="随宿主启动,一直在跑">常驻</span>}
                <span className="grow" />
                <button className="icon-btn" title="重新载入" onClick={() => setNonce((n) => n + 1)}>
                    <Icon name="reload" size={15} />
                </button>
                {origin && (
                    <a className="icon-btn" title="在新标签页打开" href={origin} target="_blank" rel="noopener noreferrer">
                        <Icon name="external" size={15} />
                    </a>
                )}
                {app.hasRun && (<>
                    <button className="icon-btn" title="查看日志" onClick={() => { void appLogs(app.id).then(setLogs); }}>
                        <Icon name="terminal" size={15} />
                    </button>
                    {running ? (
                        <button
                            className="icon-btn" title="停止"
                            onClick={() => { void stopApp(app.id).then(() => toast(`已停止「${app.name}」`)); }}
                        ><Icon name="stop" size={14} /></button>
                    ) : (
                        <button className="icon-btn" title="启动" onClick={() => setNonce((n) => n + 1)}>
                            <Icon name="play" size={14} />
                        </button>
                    )}
                </>)}
                <button className="icon-btn" title="关闭" onClick={useShell.getState().showConversation}>
                    <Icon name="x" size={15} />
                </button>
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
                // 碰不到宿主 DOM;localStorage 因 origin 不同而天然隔离
                <iframe key={`${app.id}:${nonce}`} className="app-frame" src={origin} title={app.name} />
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
    );
}

/** 图标:有 icon.svg/png 就用,没有就拿名字首字生成字母头像 —— 文件约定,不进 manifest。 */
export function AppIcon({ id, name, hasIcon, size = 16 }: { id: string; name: string; hasIcon: boolean; size?: number }) {
    if (hasIcon) return <img className="app-icon" src={`/api/apps/${id}/icon`} width={size} height={size} alt="" />;
    return <span className="app-icon letter" style={{ width: size, height: size, fontSize: size * 0.55 }}>{(name || id).slice(0, 1)}</span>;
}
