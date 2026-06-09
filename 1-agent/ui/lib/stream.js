import { on } from './ws.js';
import { mapToolCall, mkKey } from './messages.js';

// 单对话流式:监听 ws 事件,增量更新 messages 列表。
export function setupChatStream({ messages, busy, streamingKey, seenKeys, scrollToBottom }) {
  const closeStreaming = () => {
    const key = streamingKey.value;
    streamingKey.value = '';
    if (!key) return;
    const msg = messages.value.find((item) => item._key === key);
    if (msg && msg.role === 'assistant' && !msg.content) {
      messages.value = messages.value.filter((item) => item._key !== key);
    }
  };

  return [
    on('start', () => { busy.value = true; }),

    on('message', (data) => {
      busy.value = true;
      if (!data.content) return;
      let key = streamingKey.value;
      if (!key) {
        key = mkKey('assistant');
        streamingKey.value = key;
        seenKeys.value.add(key);
        messages.value.push({ role: 'assistant', content: '', _key: key });
      }
      const msg = messages.value.find((item) => item._key === key);
      if (msg) msg.content = (msg.content || '') + data.content;
      scrollToBottom?.(true);
    }),

    on('tool_calls', (data) => {
      closeStreaming();
      for (const toolCall of data.toolCalls || []) {
        const _key = mkKey('tool_call');
        seenKeys.value.add(_key);
        messages.value.push(mapToolCall(toolCall, _key));
      }
      scrollToBottom?.(true);
    }),

    on('tool_results', (data) => {
      for (const result of data.results || []) {
        for (let i = messages.value.length - 1; i >= 0; i--) {
          const msg = messages.value[i];
          if (msg.type === 'tool_call' && !msg.result) {
            msg.result = result.content;
            break;
          }
        }
      }
      scrollToBottom?.(true);
    }),

    on('done', () => {
      closeStreaming();
      busy.value = false;
      scrollToBottom?.(true);
    }),

    on('error', (data) => {
      closeStreaming();
      messages.value.push({ role: 'assistant', content: `错误: ${data.content || ''}`, _key: mkKey('error') });
      busy.value = false;
      scrollToBottom?.(true);
    }),

    on('aborted', () => {
      closeStreaming();
      busy.value = false;
    })
  ];
}
