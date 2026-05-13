const request = async (path, options = {}) => {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `${response.status} ${response.statusText}`);
  }
  return data;
};

const api = {
  health: () => request("/health"),
  listConversations: (search = "") => request(`/api/chats${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  createConversation: (title) => request("/api/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }),
  deleteConversation: (id) => request(`/api/chats?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  }),
  listMessages: (conversationId) => request(`/api/messages?conversationId=${encodeURIComponent(conversationId)}`),
  listMemos: (conversationId) => request(
    `/api/memos${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ""}`,
  ),
  getSettings: () => request("/api/settings"),
  getProviderCatalog: () => request("/api/llm/providers"),
  saveSettings: (settings) => request("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  }),
  listTasks: () => request("/api/tasks"),
  createTask: (payload) => request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }),
  abortTask: (id) => request(`/api/tasks?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "aborted" }),
  }),
  listMemories: () => request("/api/memories"),
  createMemory: (payload) => request("/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }),
  updateMemory: (id, payload) => request(`/api/memories?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }),
  deleteMemory: (id) => request(`/api/memories?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  }),
};

const streamChat = async ({ conversationId, prompt, onEvent, signal }) => {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, prompt }),
    signal,
  });

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.indexOf("\n\n");
    while (separator >= 0) {
      const chunk = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf("\n\n");

      const lines = chunk.split("\n").filter(Boolean);
      const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
      const payloadRaw = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");

      if (!eventName || !payloadRaw) continue;
      onEvent?.(eventName, JSON.parse(payloadRaw));
    }
  }
};

export { api, streamChat };
