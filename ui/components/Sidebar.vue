<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { listConversations } from '../lib/api.js';

const emit = defineEmits(['new-chat', 'open-chat', 'tasks', 'memories', 'skills', 'settings']);

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
      <div class="primary-nav">
        <button class="side-primary" type="button" @click="emit('new-chat')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New chat
        </button>
        <button class="side-primary" type="button" @click="emit('tasks')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 8v5l3 2" />
            <path d="M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z" />
          </svg>
          Tasks
        </button>
        <button class="side-primary" type="button" @click="emit('memories')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
            <path d="M4 5.5v16" />
            <path d="M8 7h8" />
            <path d="M8 11h6" />
          </svg>
          Memories
        </button>
        <button class="side-primary" type="button" @click="emit('skills')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z" />
            <path d="M9 12l2 2 4-5" />
          </svg>
          Skills
        </button>
      </div>
    </div>

    <div class="list">
      <div class="sec">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2.8l2.8 5.7 6.3.9-4.6 4.5 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.4l6.3-.9L12 2.8z" />
        </svg>
        Recent
      </div>
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
