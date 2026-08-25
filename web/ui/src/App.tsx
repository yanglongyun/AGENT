import { Sidebar } from './shell/Sidebar';
import { ConversationView } from './conversation';
import { ToastHost } from './overlay/toast';

export function App() {
    return (
        <>
            <Sidebar />
            <ConversationView />
            <ToastHost />
        </>
    );
}
