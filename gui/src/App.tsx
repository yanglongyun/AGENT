import { useEffect, useState } from "react";
import { AppShell, type RouteName } from "./components/AppShell";
import { ConversationProvider } from "./state/conversation";
import { LayoutProvider } from "./state/layout";
import { TaskProvider } from "./state/task";
import { ThemeProvider } from "./state/theme";
import { ChatView } from "./views/ChatView";
import { MemoriesView } from "./views/MemoriesView";
import { MemosView } from "./views/MemosView";
import { SettingsView } from "./views/SettingsView";
import { TasksView } from "./views/TasksView";

const routes = new Set<RouteName>(["chat", "tasks", "memos", "memories", "settings"]);

const readRoute = (): RouteName => {
  const value = window.location.hash.replace(/^#\/?/, "");
  return routes.has(value as RouteName) ? (value as RouteName) : "chat";
};

export function App() {
  const [route, setRouteState] = useState<RouteName>(readRoute);

  useEffect(() => {
    const onHashChange = () => setRouteState(readRoute());
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = "/chat";
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setRoute = (next: RouteName) => {
    window.location.hash = `/${next}`;
    setRouteState(next);
  };

  return (
    <ThemeProvider>
      <LayoutProvider>
        <ConversationProvider>
          <TaskProvider>
            <AppShell route={route} setRoute={setRoute}>
              {route === "chat" ? <ChatView /> : null}
              {route === "tasks" ? <TasksView setRoute={setRoute} /> : null}
              {route === "memos" ? <MemosView setRoute={setRoute} /> : null}
              {route === "memories" ? <MemoriesView /> : null}
              {route === "settings" ? <SettingsView /> : null}
            </AppShell>
          </TaskProvider>
        </ConversationProvider>
      </LayoutProvider>
    </ThemeProvider>
  );
}
