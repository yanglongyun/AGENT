<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { connect, ensureConnected, send, wsStatus } from './lib/ws.js';
import Messages from './components/Messages.vue';
import Composer from './components/Composer.vue';
import Settings from './components/Settings.vue';
import { parseMessages } from './lib/messages.js';
import { setupChatStream } from './lib/stream.js';

const messages = ref([]);
const busy = ref(false);
const input = ref('');
const streamingKey = ref('');
const seenKeys = ref(new Set());
const messagesRef = ref(null);
const composerRef = ref(null);
const showSettings = ref(false);
let unsubs = [];

const scrollToBottom = (smooth = true) => messagesRef.value?.scrollToBottom(smooth);

function pushUser(text) {
  const _key = `local:${Date.now()}`;
  seenKeys.value.add(_key);
  messages.value.push({ role: 'user', content: text, _key });
}

async function handleSend() {
  const text = input.value.trim();
  if (!text || busy.value) return;
  busy.value = true;
  try {
    await ensureConnected();
  } catch {
    messages.value.push({ role: 'assistant', content: '错误: WebSocket 未连接,请检查服务是否启动' });
    busy.value = false;
    return;
  }
  pushUser(text);
  send({ type: 'chat.message', prompt: text });
  input.value = '';
  composerRef.value?.resetTextarea();
  scrollToBottom(true);
}

function stopBusy() {
  send({ type: 'chat.abort' });
  busy.value = false;
}

onMounted(async () => {
  if (wsStatus.value === 'disconnected') connect();
  unsubs = setupChatStream({ messages, busy, streamingKey, seenKeys, scrollToBottom });
  try {
    const res = await fetch('/api/messages');
    const data = await res.json();
    messages.value = parseMessages(data.messages || []);
    for (const m of messages.value) if (m._key) seenKeys.value.add(m._key);
    await nextTick();
    scrollToBottom(false);
  } catch {}
});

onUnmounted(() => unsubs.forEach((fn) => fn?.()));
</script>

<template>
  <div class="absolute inset-0 flex flex-col overflow-hidden bg-bg">
    <header class="flex items-center gap-2 border-b border-line2 px-4 py-2.5">
      <div class="text-sm font-semibold text-ink">agent</div>
      <div class="ml-auto flex items-center gap-3 text-[11px] text-muted">
        <span class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full" :class="wsStatus === 'connected' ? 'bg-win' : 'bg-muted'"></span>
          {{ wsStatus === 'connected' ? '已连接' : '未连接' }}
        </span>
        <button class="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-line2 hover:text-ink"
          title="设置" @click="showSettings = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </header>

    <Messages ref="messagesRef" :messages="messages" :busy="busy" />

    <Composer
      ref="composerRef"
      v-model="input"
      :busy="busy"
      @send="handleSend"
      @abort="stopBusy"
    />

    <Settings v-if="showSettings" @close="showSettings = false" />
  </div>
</template>
