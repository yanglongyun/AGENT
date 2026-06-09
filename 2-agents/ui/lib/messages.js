export const mkKey = (kind) => `ws:${Date.now()}:${Math.random().toString(36).slice(2)}:${kind}`;

const parseToolArgs = (raw) => {
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
};

export const mapToolCall = (toolCall, _key) => {
  const name = toolCall?.function?.name || '';
  const args = parseToolArgs(toolCall?.function?.arguments);
  if (name === 'shell' && args) {
    return {
      type: 'tool_call',
      shell: true,
      toolCall,
      title: args.summary || args.reason || 'shell',
      command: args.command || '',
      expanded: false,
      _key
    };
  }
  return {
    type: 'tool_call',
    toolCall,
    title: name || '工具调用',
    detail: args ? JSON.stringify(args, null, 2) : '',
    expanded: false,
    _key
  };
};

// 把库里的原始消息行还原成 UI 气泡列表。
export const parseMessages = (rows = []) => {
  const list = [];
  for (const row of rows) {
    const m = row?.message && typeof row.message === 'object' ? row.message : row;
    if (!m) continue;
    const base = row?.id != null ? `db:${row.id}` : null;
    if (m.role === 'system') continue;

    if (m.role === 'assistant' && m.tool_calls?.length) {
      if (m.content) list.push({ role: 'assistant', content: m.content, _key: base ? `${base}:assistant` : undefined });
      m.tool_calls.forEach((tc, i) => list.push(mapToolCall(tc, base ? `${base}:tool_call:${i}` : undefined)));
      continue;
    }
    if (m.role === 'tool') {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].type === 'tool_call' && !list[i].result) {
          list[i].result = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          break;
        }
      }
      continue;
    }
    if (m.role === 'assistant' && m.content) {
      list.push({ role: 'assistant', content: m.content, _key: base ? `${base}:assistant` : undefined });
      continue;
    }
    if (m.role === 'user' && m.content) {
      list.push({ role: 'user', content: m.content, _key: base ? `${base}:user` : undefined });
    }
  }
  return list;
};
