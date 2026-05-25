import { useEffect, useMemo, useState } from "react";
import type { Memo } from "../api";
import { api } from "../api";
import type { RouteName } from "../components/AppShell";
import { useConversation } from "../state/conversation";
import { MemoTimeline } from "./memos/MemoTimeline";

export function MemosView({ setRoute }: { setRoute: (route: RouteName) => void }) {
  const conversation = useConversation();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [errorText, setErrorText] = useState("");

  const refresh = async () => {
    setErrorText("");
    try {
      const result = await api.listMemos();
      setMemos(result.memos || []);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "加载失败");
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const groups = useMemo(() => groupMemos(memos), [memos]);

  const jumpToChat = (memo: Memo) => {
    if (!memo.conversationId) return;
    conversation.setCurrentConversation(memo.conversationId, {
      id: memo.conversationId,
      title: memo.chatTitle || "",
    });
    setRoute("chat");
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-6 flex flex-col gap-5">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-3 min-w-0">
            <h2 className="m-0 text-2xl font-semibold text-text leading-tight">便签</h2>
            <p className="m-0 text-sm text-text-mute">跨会话时间轴 · 共 {memos.length} 条</p>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={refresh}>刷新</button>
        </header>
        {errorText ? <p className="inline-error">{errorText}</p> : null}
        {memos.length === 0 && !errorText ? (
          <div className="empty">
            <div className="text-text-dim font-medium">暂无便签</div>
            <div className="text-xs text-text-faint">助手在回复里写 &lt;memo&gt;…&lt;/memo&gt; 时会自动出现在这里</div>
          </div>
        ) : (
          <MemoTimeline groups={groups} jumpToChat={jumpToChat} />
        )}
      </div>
    </div>
  );
}

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} 周${WEEK[date.getDay()]}`;

export type MemoGroup = {
  key: string;
  display: string;
  sortTs: number;
  items: Memo[];
};

const groupMemos = (memos: Memo[]) => {
  const map = new Map<string, MemoGroup>();
  for (const memo of memos) {
    const date = new Date(memo.createdAt);
    const ts = Number.isNaN(date.getTime()) ? 0 : date.getTime();
    const key = ts > 0
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      : "unknown";
    if (!map.has(key)) {
      map.set(key, {
        key,
        display: ts > 0 ? formatDate(date) : "未知时间",
        sortTs: ts,
        items: [],
      });
    }
    map.get(key)?.items.push(memo);
  }
  return [...map.values()].sort((a, b) => b.sortTs - a.sortTs);
};
