import type { ReactNode } from "react";
import { useConversation } from "../state/conversation";
import { useLayout } from "../state/layout";
import { useTask } from "../state/task";
import { MainNav } from "./MainNav";
import { MobileTopBar } from "./MobileTopBar";

export type RouteName = "chat" | "tasks" | "memos" | "memories" | "settings";

export type NavItem = {
  name: RouteName;
  label: string;
  icon: "chat" | "tasks" | "memos" | "memories" | "settings";
};

export const navItems: NavItem[] = [
  { name: "chat", label: "聊天", icon: "chat" },
  { name: "tasks", label: "任务", icon: "tasks" },
  { name: "memos", label: "便签", icon: "memos" },
  { name: "memories", label: "记忆", icon: "memories" },
  { name: "settings", label: "设置", icon: "settings" },
];

export function AppShell({
  children,
  route,
  setRoute,
}: {
  children: ReactNode;
  route: RouteName;
  setRoute: (route: RouteName) => void;
}) {
  const layout = useLayout();
  const conversation = useConversation();
  const task = useTask();

  const currentNav = navItems.find((item) => item.name === route);
  const mobileTitle =
    route === "chat"
      ? conversation.current?.title || "新会话"
      : route === "tasks"
        ? task.current?.name || "任务"
        : currentNav?.label || "";
  const mobileSubTitle =
    route === "chat" && conversation.current
      ? `#${conversation.current.id}`
      : route === "tasks" && task.current
        ? `#${task.current.id}`
        : "";

  const openCurrentMobileSheet = () => {
    if (route === "chat") layout.openMobileChatList();
    if (route === "tasks") layout.openMobileTasksList();
  };

  return (
    <div className="h-screen flex flex-col md:flex-row bg-bg overflow-hidden">
      <MobileTopBar
        title={mobileTitle}
        subTitle={mobileSubTitle}
        hasSheet={route === "chat" || route === "tasks"}
        openSheet={openCurrentMobileSheet}
      />
      <MainNav route={route} setRoute={setRoute} />
      {layout.mobileNavOpen ? (
        <div className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={layout.closeMobileNav} />
      ) : null}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-bg overflow-hidden">{children}</main>
    </div>
  );
}
