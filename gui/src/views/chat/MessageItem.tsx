import type { DisplayMessage } from "../../api";
import { renderMarkdown } from "../../lib/markdown";
import { Logo } from "../../components/Icon";
import { ToolBlock } from "./ToolBlock";

export function MessageItem({
  message,
  toggleTool,
}: {
  message: DisplayMessage;
  toggleTool: (id: string) => void;
}) {
  if (message.role === "tool") return <ToolBlock message={message} toggleTool={toggleTool} />;

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="msg-content max-w-[36rem]">{message.content}</div>
      </div>
    );
  }

  return (
    <article className="flex gap-3 group">
      <Logo size="sm" />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="msg-content msg-md md-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
        {message.memo ? (
          <div className="inline-flex items-center gap-1 text-xxs" style={{ color: "var(--color-accent)" }}>
            {message.memo}
          </div>
        ) : null}
      </div>
    </article>
  );
}
