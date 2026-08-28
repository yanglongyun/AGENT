import { useEffect } from 'react';

import { Sidebar } from './shell/Sidebar';
import { ConversationView } from './conversation';
import { AppView } from './apps/AppView';
import { ToastHost } from './overlay/toast';
import { Settings } from './shell/Settings';
import { useShell } from './shell/layout';
import { init } from './conversation/store';
import { loadApps, watchApps } from './apps/store';

export function App() {
    const page = useShell((state) => state.page);
    useEffect(() => {
        void init();
        void loadApps();
        return watchApps();
    }, []);
    return (
        <>
            <Sidebar />
            {page === 'settings' ? <Settings /> : page === 'app' ? <AppView /> : <ConversationView />}
            <ToastHost />
        </>
    );
}
