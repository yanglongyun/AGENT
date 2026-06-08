<script setup>
import { BookOpen, Clock, MessagesSquare, ShieldCheck, Sprout, SquarePen } from '@lucide/vue';
import { onMounted, onUnmounted, ref } from 'vue';
import { apps } from '../apps/registry.js';
import { listConversations } from '../lib/api.js';

const emit = defineEmits(['new-chat', 'open-chat', 'open-app', 'tasks', 'subscriptions', 'growth', 'memories', 'skills', 'settings']);

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
        <b>Agent</b>
      </div>
      <div class="primary-nav">
        <button class="side-primary" type="button" @click="emit('new-chat')">
          <SquarePen />
          New chat
        </button>
        <button class="side-primary" type="button" @click="emit('tasks')">
          <Clock />
          Tasks
        </button>
        <button class="side-primary" type="button" @click="emit('subscriptions')">
          <MessagesSquare />
          Subscriptions
        </button>
        <button class="side-primary" type="button" @click="emit('growth')">
          <Sprout />
          Growth
        </button>
        <button class="side-primary" type="button" @click="emit('memories')">
          <BookOpen />
          Memories
        </button>
        <button class="side-primary" type="button" @click="emit('skills')">
          <ShieldCheck />
          Skills
        </button>
      </div>
    </div>

    <div class="list">
      <div class="sec">
        Apps
      </div>
      <button
        v-for="app in apps"
        :key="app.id"
        class="chatitem appitem"
        type="button"
        @click="emit('open-app', app.id)"
      >
        <span>{{ app.icon }}</span>
        {{ app.name }}
      </button>

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
