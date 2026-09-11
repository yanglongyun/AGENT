// 左侧栏,自上而下:品牌行 · 新对话 · 置顶组 · 最近组 · 底部(任务 + 设置)。
// 行悬停露出操作(置顶 / 重命名 / 删除),正在跑的行画呼吸点。
import { useEffect, useState } from 'react';

import { Icon, Mark } from '../icons/Icon';
import { AppIcon } from '../apps/AppView';
import { useApps, type AppInfo } from '../apps/store';
import { Sheet } from '../overlay/Sheet';
import {
    createDraft, loadRuns, openThread, removeThread, renameThread,
    togglePinned, useThread, type Thread,
} from '../thread/store';
import { useShell } from './layout';

export function Sidebar() {
    const shell = useShell();
    const { threads, currentId, liveIds } = useThread();
    const apps = useApps((state) => state.apps);
    const [renaming, setRenaming] = useState<Thread | null>(null);
    const [renameText, setRenameText] = useState('');
    const [removing, setRemoving] = useState<Thread | null>(null);

    useEffect(() => { if (renaming) setRenameText(renaming.title); }, [renaming]);

    // 呼吸点十秒对一次账 —— 事件即亮即灭,轮询只兜底
    useEffect(() => {
        const timer = setInterval(() => { void loadRuns(); }, 10_000);
        return () => clearInterval(timer);
    }, []);

    const pinned = threads.filter((item) => item.type === 'chat' && item.pinned);
    const recent = threads.filter((item) => item.type === 'chat' && !item.pinned);
    const taskActive = shell.page === 'tasks' || (shell.page === 'thread' && threads.some((item) => item.id === currentId && item.type === 'task'));
    const runningTasks = threads.filter((item) => item.type === 'task' && item.status === 'running').length;
    const live = new Set(liveIds);

    const pick = (id: string) => {
        shell.showThread();
        shell.closeDrawer();
        void openThread(id);
    };

    const confirmRename = () => {
        const thread = renaming;
        setRenaming(null);
        if (!thread) return;
        const title = renameText.trim();
        if (title && title !== thread.title) void renameThread(thread.id, title);
    };

    const appRow = (app: AppInfo) => (
        <div
            key={app.id}
            className={`app-row${shell.page === 'app' && app.id === shell.appId ? ' on' : ''}${app.status === 'invalid' ? ' bad' : ''}`}
            title={app.error || app.description || app.name}
            onClick={() => shell.showApp(app.id)}
        >
            <span className="app-row-icon"><AppIcon id={app.id} name={app.name} hasIcon={app.hasIcon} size={16} /></span>
            <span className="app-row-name clip">{app.name}</span>
            {app.status !== 'static' && app.status !== 'stopped' && <span className={`app-dot ${app.status}`} />}
        </div>
    );

    const row = (thread: Thread) => (
        <div
            key={thread.id}
            className={`conv${shell.page === 'thread' && thread.id === currentId ? ' on' : ''}`}
            onClick={() => pick(thread.id)}
        >
            {live.has(thread.id) && <span className="conv-live" title="正在运行" />}
            <span className="conv-title clip">{thread.title}</span>
            <span className="conv-ops" onClick={(event) => event.stopPropagation()}>
                {thread.type === 'chat' && <button
                    className={`op${thread.pinned ? ' held' : ''}`}
                    title={thread.pinned ? '取消置顶' : '置顶'}
                    onClick={() => void togglePinned(thread)}
                >
                    <Icon name={thread.pinned ? 'pinFill' : 'pin'} size={13} />
                </button>}
                <button className="op" title="重命名" onClick={() => setRenaming(thread)}>
                    <Icon name="pen" size={13} />
                </button>
                <button className="op danger" title="删除" onClick={() => setRemoving(thread)}>
                    <Icon name="trash" size={13} />
                </button>
            </span>
        </div>
    );

    return (
        <>
            {shell.drawer && <div className="side-veil" onClick={shell.closeDrawer} />}

            <aside className={`sidebar${shell.collapsed ? ' folded' : ''}${shell.drawer ? ' open' : ''}`}>
                <div className="side-head">
                    <Mark size={24} />
                    <span className="side-brand">AGENT</span>
                    <span className="grow" />
                    <button className="icon-btn fold-btn" title="收起侧栏" onClick={shell.toggleCollapsed}>
                        <Icon name="panel" size={16} />
                    </button>
                </div>

                {/* 新对话是动作不是清单的一行,恒在顶部,不进滚动区 */}
                <button
                    className="side-new"
                    onClick={() => { shell.showThread(); createDraft(); }}
                >
                    <Icon name="compose" size={16} /><span>新对话</span>
                </button>

                <div className="side-scroll">
                    {apps.length > 0 && (<>
                        <div className="side-label">应用</div>
                        {apps.map(appRow)}
                    </>)}
                    {pinned.length > 0 && (<>
                        <div className="side-label">置顶</div>
                        {pinned.map(row)}
                    </>)}
                    {recent.length > 0 && (<>
                        <div className="side-label">最近</div>
                        {recent.map(row)}
                    </>)}
                    {!pinned.length && !recent.length && <div className="side-empty">还没有对话</div>}
                </div>

                <div className="side-foot">
                    <button className={`side-settings${taskActive ? ' on' : ''}`} aria-current={taskActive ? 'page' : undefined} onClick={shell.showTasks}>
                        <Icon name="tasks" size={15} /><span>任务</span>{runningTasks > 0 && <span className="side-task-count">{runningTasks}</span>}
                    </button>
                    <button className={`side-settings${shell.page === 'settings' ? ' on' : ''}`} onClick={shell.showSettings}>
                        <Icon name="settings" size={15} /><span>设置</span>
                    </button>
                </div>
            </aside>

            {renaming && (
                <Sheet title="重命名" onClose={() => setRenaming(null)}>
                    <input
                        className="field-input"
                        value={renameText}
                        autoFocus
                        placeholder="对话标题"
                        onChange={(event) => setRenameText(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') confirmRename(); }}
                    />
                    <div className="sheet-foot">
                        <button className="btn btn-quiet" onClick={() => setRenaming(null)}>取消</button>
                        <button className="btn btn-accent" onClick={confirmRename}>保存</button>
                    </div>
                </Sheet>
            )}

            {removing && (
                <Sheet title="删除" onClose={() => setRemoving(null)}>
                    <div className="sheet-note">「{removing.title}」的全部消息会一并删除,不可恢复。</div>
                    <div className="sheet-foot">
                        <button className="btn btn-quiet" onClick={() => setRemoving(null)}>取消</button>
                        <button
                            className="btn btn-danger"
                            onClick={() => { const target = removing; setRemoving(null); void removeThread(target.id); }}
                        >删除</button>
                    </div>
                </Sheet>
            )}
        </>
    );
}
