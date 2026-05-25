import type { Memo } from "../../api";
import type { MemoGroup } from "../MemosView";

export function MemoTimeline({
  groups,
  jumpToChat,
}: {
  groups: MemoGroup[];
  jumpToChat: (memo: Memo) => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          <div className="sticky top-0 z-10 -mx-5 px-5 py-1.5 bg-bg/95 backdrop-blur text-xs font-semibold text-text-dim tracking-wide">
            {group.display}
          </div>
          <ol className="relative flex flex-col gap-4 pl-6">
            <span className="absolute left-[9px] top-2 bottom-2 w-px bg-border-soft" aria-hidden="true" />
            {group.items.map((memo) => (
              <li key={memo.id} className="relative">
                <span className="absolute -left-[19px] top-[7px] w-[10px] h-[10px] rounded-full ring-4 ring-bg bg-accent" aria-hidden="true" />
                <div className="flex flex-col gap-1.5 py-0.5">
                  <div className="flex items-baseline gap-2 text-xxs text-text-faint flex-wrap">
                    <span className="font-mono">#{memo.id}</span>
                    <span>{formatHM(memo.createdAt)}</span>
                    {memo.chatTitle ? (
                      <button className="text-accent hover:underline truncate max-w-[280px]" title={memo.chatTitle} onClick={() => jumpToChat(memo)}>
                        {memo.chatTitle}
                      </button>
                    ) : (
                      <span className="text-text-faint italic">任务产出</span>
                    )}
                  </div>
                  <p className="m-0 text-sm text-text leading-relaxed break-words">{memo.content}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

const formatHM = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};
