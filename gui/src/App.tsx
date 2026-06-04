import { useEffect, useState } from "react";
import { AppShell, type RouteName } from "./components/AppShell";
import { ConversationProvider } from "./state/conversation";
import { LayoutProvider } from "./state/layout";
import { SocketProvider } from "./state/socket";
import { TaskProvider } from "./state/task";
import { ThemeProvider } from "./state/theme";
import { ChatView } from "./views/ChatView";
import { MemoriesView } from "./views/MemoriesView";
import { MemosView } from "./views/MemosView";
import { ObjectivesView } from "./views/ObjectivesView";
import { SettingsView } from "./views/SettingsView";
import { SkillsView } from "./views/SkillsView";
import { TasksView } from "./views/TasksView";

const routes = new Set<RouteName>(["chat", "objectives", "tasks", "memos", "memories", "skills", "settings"]);

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
        <SocketProvider>
          <ConversationProvider>
            <TaskProvider>
              <AppShell route={route} setRoute={setRoute}>
                {route === "chat" ? <ChatView /> : null}
                {route === "objectives" ? <ObjectivesView setRoute={setRoute} /> : null}
                {route === "tasks" ? <TasksView setRoute={setRoute} /> : null}
                {route === "memos" ? <MemosView setRoute={setRoute} /> : null}
                {route === "memories" ? <MemoriesView /> : null}
                {route === "skills" ? <SkillsView /> : null}
                {route === "settings" ? <SettingsView /> : null}
              </AppShell>
            </TaskProvider>
          </ConversationProvider>
        </SocketProvider>
      </LayoutProvider>
    </ThemeProvider>
  );
}
