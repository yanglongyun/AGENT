import { useEffect, useState } from 'react';
import { Icon } from '../icons/Icon';
import { loadThreads, openThread, useThread } from '../thread/store';
import { useShell } from '../shell/layout';
import { taskStatus, taskTime } from './status';
import './tasks.css';

export function Tasks() {
    const shell = useShell();
    const threads = useThread((state) => state.threads);
    const tasks = threads.filter((item) => item.type === 'task').sort((a, b) => b.updated.localeCompare(a.updated));
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [status, setStatus] = useState('');
    const [query, setQuery] = useState('');

    const refresh = async () => {
        setLoading(true);
        setError(!(await loadThreads()));
        setLoading(false);
    };
    useEffect(() => { void refresh(); }, []);

    const visible = tasks.filter((task) => (!status || task.status === status)
        && task.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    const running = tasks.filter((task) => task.status === 'running').length;
    const view = (id: string) => { void openThread(id); shell.showThread(); };

    return (
        <section className="tasks-page">
            <header className="topbar">
                <button className={`icon-btn menu-btn${shell.collapsed ? ' show' : ''}`} title="展开侧栏" onClick={shell.openSidebar}>
                    <Icon name="panel" size={17} />
                </button>
                <span className="topbar-title">任务</span>
            </header>
            <main className="tasks-content">
                <div className="tasks-panel">
                    <div className="tasks-heading">
                        <div><h1>任务活动</h1><p>查看 Apps 发起的执行过程和结果</p></div>
                        <span className="tasks-count">共 {tasks.length} 项{running > 0 ? ` · ${running} 项执行中` : ''}</span>
                    </div>
                    <div className="tasks-filters">
                        <input className="field-input" type="search" aria-label="搜索任务" placeholder="搜索任务" value={query} onChange={(event) => setQuery(event.target.value)} />
                        <select className="field-input" aria-label="任务状态" value={status} onChange={(event) => setStatus(event.target.value)}>
                            <option value="">全部状态</option>
                            {Object.entries(taskStatus).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </div>
                    {error && <div className="tasks-error" role="alert">任务加载失败 <button className="btn btn-quiet" onClick={() => void refresh()}>重试</button></div>}
                    {loading && !tasks.length ? <div className="tasks-empty">正在加载任务…</div> : (
                        visible.length ? <div className="task-list" aria-label="任务活动列表">
                            {visible.map((task) => (
                                <button key={task.id} className="task-row" onClick={() => view(task.id)}>
                                    <span className={`task-symbol ${task.status || 'pending'}`}><Icon name={task.status === 'completed' ? 'check' : task.status === 'failed' ? 'x' : 'tasks'} size={18} /></span>
                                    <span className="task-description"><span className="task-title">{task.title}</span><span className="task-time">更新于 {taskTime(task.updated)}</span></span>
                                    <span className={`task-status ${task.status || 'pending'}`}>{taskStatus[task.status || ''] || task.status}</span>
                                    <Icon name="chev" size={15} />
                                </button>
                            ))}
                        </div> : !error && <div className="tasks-empty"><Icon name="tasks" size={30} /><strong>{tasks.length ? '没有符合条件的任务' : '暂无任务活动'}</strong><span>{tasks.length ? '试试其他关键词或状态' : 'Apps 发起任务后，执行过程和结果会显示在这里'}</span></div>
                    )}
                </div>
            </main>
        </section>
    );
}
