import { useEffect } from 'react';

import { Sidebar } from './shell/Sidebar';
import { ConversationView } from './conversation';
import { ToastHost } from './overlay/toast';
import { Settings } from './shell/Settings';
import { useShell } from './shell/layout';
import { init, useConversation } from './conversation/store';
import { loadPermission, watchPermission } from './permission/store';

export function App() {
    const page = useShell((state) => state.page);
    const currentId = useConversation((state) => state.currentId);
    useEffect(() => { void init(); return watchPermission(); }, []);
    // 换对话要重新捞规矩和还悬着的确认卡 —— 两者都是按对话分的
    useEffect(() => { void loadPermission(); }, [currentId]);
    return (
        <>
            <Sidebar />
            {page === 'settings' ? <Settings /> : <ConversationView />}
            <ToastHost />
        </>
    );
}
