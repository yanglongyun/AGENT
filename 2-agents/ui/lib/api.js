const json = (res) => res.json().catch(() => ({}));

const request = async (url, options = {}) => {
  const res = await fetch(url, options);
  const data = await json(res);
  if (!res.ok) throw new Error(data.error || `${res.status}`);
  return data;
};

// 对话 CRUD
export const listConversations = async () => {
  const data = await request('/api/conversations');
  return data.conversations || [];
};

export const getConversation = (id) => request(`/api/conversations/${id}`).then((d) => d.conversation);

export const createConversation = (payload) =>
  request('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((d) => d.conversation);

export const updateConversation = (id, payload) =>
  request(`/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((d) => d.conversation);

export const deleteConversation = (id) =>
  request(`/api/conversations/${id}`, { method: 'DELETE' });

// 消息
export const listMessages = (id) =>
  request(`/api/conversations/${id}/messages`).then((d) => d.messages || []);

export const sendMessage = (id, content) =>
  request(`/api/conversations/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

export const clearMessages = (id) =>
  request(`/api/conversations/${id}/messages`, { method: 'DELETE' });

export const abortConversation = (id) =>
  request(`/api/conversations/${id}/abort`, { method: 'POST' });

// 设置
export const getSettings = () => request('/api/settings');
export const saveSettings = (payload) =>
  request('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
