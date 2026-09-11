import { Icon } from '../icons/Icon';
import { usePopover } from '../overlay/usePopover';
import { useShell } from '../shell/layout';
import { toast } from '../overlay/toast';
import { stopApp, type AppInfo } from './store';

export function AppMenu({ app, origin, reload, logs }: { app: AppInfo; origin: string; reload(): void; logs(): void }) {
    const { open, setOpen, ref } = usePopover();
    const act = (action: () => void) => { setOpen(false); action(); };
    const running = app.status === 'ready' || app.status === 'starting';
    return <div className="app-menu-anchor" ref={ref}>
        <button className="icon-btn" title="更多" aria-label="更多应用操作" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}><Icon name="more" size={18} /></button>
        {open && <div className="app-menu" role="menu" aria-label="应用操作">
            <button role="menuitem" onClick={() => act(reload)}><Icon name="reload" size={16} />重新载入</button>
            {origin && <a role="menuitem" href={origin} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}><Icon name="external" size={16} />在新标签页打开</a>}
            {app.hasRun && <>
                <button role="menuitem" onClick={() => act(logs)}><Icon name="terminal" size={16} />查看日志</button>
                {running ? <button role="menuitem" onClick={() => act(() => { void stopApp(app.id).then(() => toast(`已停止「${app.name}」`)).catch((error) => toast(error.message)); })}><Icon name="stop" size={16} />停止应用</button>
                    : <button role="menuitem" onClick={() => act(reload)}><Icon name="play" size={16} />启动应用</button>}
            </>}
            <button role="menuitem" onClick={() => act(useShell.getState().showThread)}><Icon name="x" size={16} />关闭应用</button>
        </div>}
    </div>;
}
