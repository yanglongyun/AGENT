<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { connect, ensureConnected, subscribe, wsStatus } from './lib/ws.js';
import Sidebar from './components/Sidebar.vue';
import Messages from './components/Messages.vue';
import Composer from './components/Composer.vue';
import Settings from './components/Settings.vue';
import NewConversation from './components/NewConversation.vue';
import { listConversations, listMessages as apiListMessages, sendMessage, abortConversation } from './lib/api.js';
import { parseMessages } from './lib/messages.js';
import { setupChatStream } from './lib/stream.js';

const currentId = ref(null);
const currentTitle = ref('');
const currentDescription = ref('');

const messages = ref([]);
const busy = ref(false);
const input = ref('');
const streamingKey = ref('');
const seenKeys = ref(new Set());

const messagesRef = ref(null);
const composerRef = ref(null);
const sidebarRef = ref(null);

const showSettings = ref(false);
const showNew = ref(false);

let unsubs = [];

const scrollToBottom = (smooth = true) => messagesRef.value?.scrollToBottom(smooth);

async function selectConversation(c) {
  if (!c) return;
  currentId.value = c.id;
  currentTitle.value = c.title;
  currentDescription.value = c.description || '';
  // 切到这个对话:订阅它的事件,载入历史
  subscribe(c.id);
  messages.value = [];
  streamingKey.value = '';
  seenKeys.value = new Set();
  busy.value = false;
  try {
    const rows = await apiListMessages(c.id);
    messages.value = parseMessages(rows);
    for (const m of messages.value) if (m._key) seenKeys.value.add(m._key);
    await nextTick();
    scrollToBottom(false);
  } catch {}
}

async function handleSend() {
  const text = input.value.trim();
  if (!text || busy.value || !currentId.value) return;
  busy.value = true;
  input.value = '';
  composerRef.value?.resetTextarea();
  try {
    await ensureConnected();
    await sendMessage(currentId.value, text);
    // 不本地 push:服务端会广播 input 事件,stream 自动渲染
  } catch (e) {
    messages.value.push({ role: 'assistant', content: `错误: ${e.message || 'send failed'}`, _key: `err:${Date.now()}` });
    busy.value = false;
  }
  scrollToBottom(true);
}

async function stopBusy() {
  if (!currentId.value) return;
  try { await abortConversation(currentId.value); } catch {}
  busy.value = false;
}

async function onCreated(conversation) {
  showNew.value = false;
  await sidebarRef.value?.refresh();
  await selectConversation(conversation);
}

onMounted(async () => {
  if (wsStatus.value === 'disconnected') connect();
  unsubs = setupChatStream({ messages, busy, streamingKey, seenKeys, scrollToBottom });
  // 默认选第一个对话
  try {
    const all = await listConversations();
    if (all.length) await selectConversation(all[0]);
  } catch {}
});

onUnmounted(() => unsubs.forEach((fn) => fn?.()));
</script>

<template>
  <div class="app">
    <Sidebar
      ref="sidebarRef"
      :current-id="currentId"
      @select="selectConversation"
      @new="showNew = true"
      @settings="showSettings = true"
    />

    <main class="main">
      <header class="mhead">
        <b>{{ currentTitle || 'agent' }}</b>
        <span v-if="currentDescription" class="text-xs text-muted">— {{ currentDescription }}</span>
        <span class="spacer"></span>
        <span class="flex items-center gap-1.5 text-[11px] text-muted">
          <span class="h-2 w-2 rounded-full" :class="wsStatus === 'connected' ? 'bg-win' : 'bg-muted'"></span>
          {{ wsStatus === 'connected' ? '已连接' : '未连接' }}
        </span>
      </header>

      <div class="chat-stage">
        <div v-if="!currentId" class="empty">
          <div class="mark"></div>
          <div class="big">还没有对话</div>
          <div class="sub">点左侧"新对话"创建一个。每个对话有自己的标题、描述、提示词,AI 之间能通过 HTTP API 互相找到对方。</div>
        </div>
        <template v-else>
          <Messages ref="messagesRef" :messages="messages" :busy="busy" />
          <Composer
            ref="composerRef"
            v-model="input"
            :busy="busy"
            @send="handleSend"
            @abort="stopBusy"
          />
        </template>
      </div>
    </main>

    <Settings v-if="showSettings" @close="showSettings = false" />
    <NewConversation v-if="showNew" @close="showNew = false" @created="onCreated" />
  </div>
</template>

<style scoped>
.chat-stage { display: flex; flex-direction: column; }
</style>
