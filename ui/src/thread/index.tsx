// 对话列:顶栏 + 消息流 + 输入区。
import { useEffect, useState } from 'react';
import { ThreadPanel } from './ThreadPanel';
import { ChatTitle } from './ChatTitle';
import { Icon } from '../icons/Icon';
import { useChannel } from '../lib/channel';
import { useShell } from '../shell/layout';
import { Composer } from './Composer';
import { MessageStream } from './MessageStream';
import { cancelTask, useThread } from './store';
import { taskStatus, taskTime } from '../tasks/status';

export function ThreadView({ panel = false, onClose }: { panel?: boolean; onClose?: () => void } = {}) {
    const [panelOpen, setPanelOpen] = useState(false);
    const shell = useShell();
    const connected = useChannel((state) => state.connected);
    const { threads, currentId, rows, ready } = useThread();

    const title = currentId
        ? threads.find((item) => item.id === currentId)?.title || '对话'
        : '新对话';

    const current = threads.find((item) => item.id === currentId);
    useEffect(() => setPanelOpen(false), [currentId]);


    return (
        <div className={`thread-workspace${panelOpen ? ' has-panel' : ''}`}><section className={`thread${ready && !rows.length ? ' is-blank' : ''}`}>
            <header className="topbar">
                {!panel && <button
                    className={`icon-btn menu-btn${shell.collapsed ? ' show' : ''}`}
                    title="展开侧栏"
                    onClick={shell.openSidebar}
                >
                    <Icon name="panel" size={17} />
                </button>}
                {current?.type === 'task' && <button className="task-back" onClick={shell.showTasks}><Icon name="chev" size={14} />返回任务</button>}
                {current?.type === 'task' ? <span className="topbar-title clip">{title}</span> : <ChatTitle title={title} />}
                {current?.type === 'task' && <span className="grow" />}
                {current?.status && <span className="model-tag">{taskStatus[current.status] || current.status}</span>}
                {!connected && <span className="offline-pill"><i />连接已断开,恢复中…</span>}
                {panel && <button className="icon-btn" title="收起对话面板" onClick={onClose}><Icon name="x" size={16} /></button>}
                {current?.type !== 'task' && <button className="icon-btn" title="对话面板" aria-label="打开对话配置" aria-expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)}><Icon name="panel" size={17} /></button>}
            </header>
            {current?.type === 'task' && <div className="task-details">
                <span>创建于 {taskTime(current.created)}</span>
                <span>更新于 {taskTime(current.updated)}</span>
                {current.finished && <span>结束于 {taskTime(current.finished)}</span>}
                <span className="grow" />
                {!['completed', 'failed', 'cancelled'].includes(current.status || '') && <button className="task-back" onClick={() => void cancelTask(current.id)}>取消任务</button>}
            </div>}
            <MessageStream readOnly={current?.type === 'task'} />
            {current?.type === 'task' ? <div className="foot-note">此任务由 App 发起，消息仅供查看</div> : <Composer />}
        </section>
            {panelOpen && <ThreadPanel key={currentId} id={currentId} onClose={() => setPanelOpen(false)} />}
        </div>
    );
}
