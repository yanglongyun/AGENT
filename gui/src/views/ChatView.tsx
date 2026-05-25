import { useCallback, useEffect, useState } from "react";
import type { Conversation, DisplayMessage } from "../api";
import { api, streamChat } from "../api";
import { useConversation } from "../state/conversation";
import { useLayout } from "../state/layout";
import { buildToolMessage, normalizeForDisplay, titleFromPrompt } from "../lib/messages";
import { ChatInput } from "./chat/ChatInput";
import { ConversationList } from "./chat/ConversationList";
import { MessageList } from "./chat/MessageList";
import { MobileConversationSheet } from "./chat/MobileConversationSheet";

export function ChatView() {
  const conversation = useConversation();
  const layout = useLayout();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [draftMode, setDraftMode] = useState(false);

  const refreshConversations = useCallback(async (options: { selectFirst?: boolean } = {}) => {
    const result = await api.listConversations(search.trim());
    const list = result.conversations || [];
    setConversations(list);
    if (options.selectFirst !== false && !draftMode && !conversation.currentId && list.length > 0) {
      conversation.setCurrentConversation(list[0].id, list[0]);
    } else if (conversation.currentId) {
      const fresh = list.find((item) => item.id === conversation.currentId);
      if (fresh) conversation.setCurrentConversation(fresh.id, fresh);
    }
  }, [conversation, draftMode, search]);

  const refreshMessages = useCallback(
    async (id = conversation.currentId) => {
      if (!id) {
        setMessages([]);
        return;
      }
      const result = await api.listMessages(id);
      setMessages(normalizeForDisplay(result.messages || []));
    },
    [conversation.currentId],
  );

  useEffect(() => {
    refreshConversations().catch((error) => setErrorText(error.message || "加载失败"));
  }, []);

  useEffect(() => {
    const applyPrompt = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (typeof value === "string") setPrompt(value);
    };
    window.addEventListener("agent:applyPrompt", applyPrompt);
    return () => window.removeEventListener("agent:applyPrompt", applyPrompt);
  }, []);

  useEffect(() => {
    refreshMessages().catch((error) => setErrorText(error.message || "加载失败"));
  }, [conversation.currentId, refreshMessages]);

  const selectConversation = async (id: string) => {
    const item = conversations.find((entry) => entry.id === id) || null;
    conversation.setCurrentConversation(id, item);
    setDraftMode(false);
    layout.closeMobileChatList();
  };

  const startConversation = () => {
    conversation.clearCurrentConversation();
    setMessages([]);
    setPrompt("");
    setErrorText("");
    setDraftMode(true);
    layout.closeMobileChatList();
  };

  const removeConversation = async (id: string) => {
    if (!window.confirm("删除此会话？")) return;
    await api.deleteConversation(id);
    if (conversation.currentId === id) {
      conversation.clearCurrentConversation();
      setMessages([]);
      setDraftMode(true);
    }
    await refreshConversations();
  };

  const renameConversation = async (title: string) => {
    if (!conversation.currentId) return;
    const result = await api.updateConversationTitle(conversation.currentId, title);
    if (result.conversation) {
      conversation.setCurrentConversation(result.conversation.id, result.conversation);
      setConversations((items) =>
        items.map((item) => (item.id === result.conversation.id ? { ...item, ...result.conversation } : item)),
      );
    }
  };

  const findStreamingAssistant = (list: DisplayMessage[]) => {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const item = list[index];
      if (item.role === "assistant" && item.streaming) return index;
    }
    return -1;
  };

  const endStreamingAssistant = () => {
    setMessages((items) => {
      const index = findStreamingAssistant(items);
      if (index < 0) return items;
      const next = [...items];
      next[index] = { ...next[index], streaming: false };
      return next;
    });
  };

  const toggleTool = (id: string) => {
    setMessages((items) =>
      items.map((item) => (item._id === id ? { ...item, expanded: !item.expanded } : item)),
    );
  };

  const sendPrompt = async () => {
    const text = prompt.trim();
    if (!text || sending) return;

    setSending(true);
    setErrorText("");

    try {
      let conversationId = conversation.currentId;
      if (!conversationId) {
        const result = await api.createConversation(titleFromPrompt(text));
        conversationId = result.conversation?.id;
        if (!conversationId) throw new Error("failed to create conversation");
        conversation.setCurrentConversation(conversationId, result.conversation);
        setDraftMode(false);
      }

      setMessages((items) => [
        ...items,
        { role: "user", content: text, _id: `local:${Date.now()}:u` },
      ]);
      setPrompt("");

      const controller = new AbortController();
      setAbortController(controller);

      await streamChat({
        conversationId,
        prompt: text,
        signal: controller.signal,
        onEvent: (eventName, payload) => {
          if (eventName === "delta") {
            setMessages((items) => {
              const next = [...items];
              let index = findStreamingAssistant(next);
              if (index < 0) {
                next.push({
                  role: "assistant",
                  content: "",
                  streaming: true,
                  _id: `local:${Date.now()}:${Math.random()}:a`,
                });
                index = next.length - 1;
              }
              next[index] = {
                ...next[index],
                content: `${next[index].content || ""}${payload.delta || ""}`,
              };
              return next;
            });
            return;
          }

          if (eventName === "tool_call") {
            endStreamingAssistant();
            setMessages((items) => [
              ...items,
              buildToolMessage(payload.toolCall, `local:${Date.now()}:${Math.random()}:tc`),
            ]);
            return;
          }

          if (eventName === "tool_result") {
            const content = payload.message?.content ?? "";
            const toolCallId = payload.message?.tool_call_id || "";
            setMessages((items) => {
              const next = [...items];
              let target = -1;
              if (toolCallId) {
                for (let index = next.length - 1; index >= 0; index -= 1) {
                  if (next[index].role === "tool" && next[index].toolCallId === toolCallId) {
                    target = index;
                    break;
                  }
                }
              }
              if (target < 0) {
                for (let index = next.length - 1; index >= 0; index -= 1) {
                  if (next[index].role === "tool" && next[index].result == null) {
                    target = index;
                    break;
                  }
                }
              }
              if (target >= 0) next[target] = { ...next[target], result: String(content) };
              else {
                next.push({
                  role: "tool",
                  _id: `local:${Date.now()}:${Math.random()}:tr`,
                  toolName: "tool",
                  orphan: true,
                  result: String(content),
                  expanded: false,
                });
              }
              return next;
            });
            return;
          }

          if (eventName === "done") {
            setMessages((items) => {
              const index = findStreamingAssistant(items);
              if (index < 0) return items;
              const next = [...items];
              next[index] = {
                ...next[index],
                streaming: false,
                memo: payload.message?.memo || next[index].memo,
              };
              return next;
            });
          }
        },
      });

      await refreshConversations();
      await refreshMessages(conversationId);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setErrorText(error instanceof Error ? error.message : "发送失败");
      }
      endStreamingAssistant();
      await refreshMessages().catch(() => {});
    } finally {
      setSending(false);
      setAbortController(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 min-w-0 flex relative">
      <ConversationList
        conversations={conversations}
        selectedId={conversation.currentId}
        search={search}
        setSearch={setSearch}
        refresh={refreshConversations}
        startConversation={startConversation}
        selectConversation={selectConversation}
        removeConversation={removeConversation}
      />
      <section className="flex-1 flex flex-col min-h-0 min-w-0 relative">
        <MessageList
          title={conversation.current?.title || (conversation.current ? `会话 #${conversation.current.id}` : "新会话")}
          canRename={!!conversation.currentId}
          renameConversation={renameConversation}
          messages={messages}
          toggleTool={toggleTool}
        />
        <ChatInput
          value={prompt}
          setValue={setPrompt}
          sending={sending}
          errorText={errorText}
          send={sendPrompt}
          stop={() => abortController?.abort()}
        />
      </section>
      <MobileConversationSheet
        conversations={conversations}
        selectedId={conversation.currentId}
        selectConversation={selectConversation}
        startConversation={startConversation}
        close={layout.closeMobileChatList}
        open={layout.mobileChatListOpen}
      />
    </div>
  );
}
