<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { listConversations } from '../lib/api.js';

const emit = defineEmits(['new-chat', 'open-chat', 'tasks', 'settings']);

const chats = ref([]);

async function refresh() {
  try {
    chats.value = await listConversations();
  } catch {
    chats.value = [];
  }
}

function formatChatTitle(chat) {
  return chat?.title || 'New chat';
}

onMounted(() => {
  refresh();
  window.addEventListener('agent:refresh-chats', refresh);
});

onUnmounted(() => {
  window.removeEventListener('agent:refresh-chats', refresh);
});
</script>

<template>
  <aside class="nav">
    <div class="top">
      <div class="logo">
        <span class="mark"></span>
        <b>Agent Chat</b>
      </div>
      <button class="newchat" type="button" @click="emit('new-chat')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New chat
      </button>
    </div>

    <div class="list">
      <button class="nav-action" type="button" @click="emit('tasks')">
        <span class="nav-action-icon">⏱</span>
        Tasks
      </button>
      <button
        v-for="chat in chats"
        :key="chat.id"
        class="chatitem"
        type="button"
        @click="emit('open-chat', chat)"
      >
        {{ formatChatTitle(chat) }}
      </button>
      <div v-if="!chats.length" class="nav-empty">No conversations yet</div>
    </div>

    <div class="nav-footer">
      <button class="settings-entry" type="button" @click="emit('settings')">
        <span class="settings-dot"></span>
        <span>
          <b>Settings</b>
          <small>Model and system prompt</small>
        </span>
      </button>
    </div>
  </aside>
</template>
