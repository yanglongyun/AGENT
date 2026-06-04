import { Bot, CheckSquare, FileText, MessageSquare, Settings, Sparkles, Star, Target } from "lucide-react";
import { useLayout } from "../state/layout";
import { useTheme } from "../state/theme";
import { Logo } from "./Icon";
import { navItems, type RouteName } from "./AppShell";

const iconMap = {
  chat: MessageSquare,
  objectives: Target,
  tasks: CheckSquare,
  memos: FileText,
  memories: Star,
  skills: Sparkles,
  settings: Settings,
};

export function MainNav({
  route,
  setRoute,
}: {
  route: RouteName;
  setRoute: (route: RouteName) => void;
}) {
  const layout = useLayout();
  const theme = useTheme();
  const collapsed = layout.mainNavCollapsed;

  return (
    <aside
      className={[
        "flex flex-col shrink-0 transition-[width,transform] duration-300 ease-out",
        "max-md:fixed max-md:top-0 max-md:left-0 max-md:bottom-0 max-md:w-[260px] max-md:z-50",
        "max-md:rounded-r-2xl max-md:border-r max-md:border-border-soft max-md:shadow-2xl md:static",
        layout.mobileNavOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        collapsed ? "md:w-[64px]" : "md:w-[260px]",
      ].join(" ")}
      style={{ background: "linear-gradient(to right, var(--nav-from), var(--nav-to)), var(--color-bg)" }}
    >
      <div className={["flex items-center gap-2.5 pt-4 pb-4 select-none px-4", collapsed ? "md:px-3 md:justify-center" : ""].join(" ")}>
        <Logo />
        <div className={["flex flex-col leading-tight min-w-0", collapsed ? "md:hidden" : ""].join(" ")}>
          <strong className="text-base font-semibold tracking-tight text-text truncate">AGENT</strong>
          <span className="text-xxs text-text-mute truncate">本地控制台</span>
        </div>
        <button className="md:hidden btn btn-sm btn-ghost ml-auto !px-2" title="关闭" onClick={layout.closeMobileNav}>
          <Bot size={16} className="hidden" />
          <span className="text-lg leading-none">×</span>
        </button>
      </div>

      <div className="flex flex-col gap-0.5 px-2 flex-1 min-h-0 overflow-y-auto">
        <div className={["text-xxs uppercase tracking-wider text-text-faint px-3 pt-2 pb-1.5 font-semibold", collapsed ? "md:hidden" : ""].join(" ")}>工作区</div>
        {navItems.map((item) => {
          const Icon = iconMap[item.icon];
          return (
            <button
              key={item.name}
              className={["nav-item", route === item.name ? "active" : "", collapsed ? "md:justify-center md:px-0" : ""].join(" ")}
              title={collapsed ? item.label : ""}
              onClick={() => {
                setRoute(item.name);
                layout.closeMobileNav();
              }}
            >
              <span className="w-4 h-4 grid place-items-center shrink-0" aria-hidden="true">
                <Icon size={16} strokeWidth={1.8} />
              </span>
              <span className={["flex-1 min-w-0 truncate", collapsed ? "md:hidden" : ""].join(" ")}>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className={["hidden md:flex items-center px-2 py-2.5 border-t border-border-soft gap-1", collapsed ? "justify-center flex-col gap-1" : "justify-between"].join(" ")}>
        <button className="btn btn-sm btn-ghost !px-2 !h-8 !w-8" title={theme.mode === "dark" ? "切换到浅色主题" : "切换到深色主题"} onClick={theme.toggleTheme}>
          {theme.mode === "dark" ? <span className="i-sun"><SunIcon /></span> : <MoonIcon />}
        </button>
        <button className="btn btn-sm btn-ghost !px-2 !h-8 !w-8" title={collapsed ? "展开导航" : "收起导航"} onClick={layout.toggleMainNav}>
          <span className={["transition-transform", collapsed ? "" : "rotate-180"].join(" ")}>›</span>
        </button>
      </div>
    </aside>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 1 0 9 9 9 9 0 1 1-9-9z" />
    </svg>
  );
}
