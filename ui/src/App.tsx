import { useEffect } from 'react';

import { Sidebar } from './shell/Sidebar';
import { ConversationView } from './conversation';
import { AppView } from './apps/AppView';
import { ToastHost } from './overlay/toast';
import { Settings } from './shell/Settings';
import { useShell } from './shell/layout';
import { init, useConversation } from './conversation/store';
import { loadApps, watchApps } from './apps/store';
import { loadPermission, watchPermission } from './permission/store';
import { onChannel } from './lib/channel';
import { EVENTS } from '@shared/events';
import { toast } from './overlay/toast';

export function App() {
    const page = useShell((state) => state.page);
    const currentId = useConversation((state) => state.currentId);

    useEffect(() => {
        void init();
        void loadApps();
        const stopApps = watchApps();
        const stopPermission = watchPermission();
        // app 经 /host/notify 发来的提示。v1 里 badge 也先落成 toast
        const stopNotify = onChannel((type, data) => {
            if (type !== EVENTS.APP_NOTIFY) return;
            const { appName, text } = data as { appName: string; text: string };
            toast(`「${appName}」${text}`, 3200);
        });
        return () => { stopApps(); stopPermission(); stopNotify(); };
    }, []);

    // 换对话要重新捞还悬着的确认卡 —— 它是按对话分的
    useEffect(() => { void loadPermission(); }, [currentId]);

    return (
        <>
            <Sidebar />
            {page === 'settings' ? <Settings /> : page === 'app' ? <AppView /> : <ConversationView />}
            <ToastHost />
        </>
    );
}
