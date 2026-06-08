<script setup>
import { BookOpen, Clock, MessagesSquare, MonitorSmartphone, ShieldCheck, Sprout, SquarePen } from '@lucide/vue';
import { onMounted, onUnmounted, ref } from 'vue';
import { apps } from '../apps/registry.js';
import { listConversations } from '../lib/api.js';
import { t } from '../lib/locale.js';

const emit = defineEmits(['new-chat', 'open-chat', 'open-app', 'tasks', 'subscriptions', 'growth', 'memories', 'skills', 'controls', 'settings']);

const chats = ref([]);

async function refresh() {
  try {
    chats.value = await listConversations();
  } catch {
    chats.value = [];
  }
}

function formatChatTitle(chat) {
  return chat?.title || t('nav_new_chat', 'New chat');
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
          {{ t('nav_new_chat', 'New chat') }}
        </button>
        <button class="side-primary" type="button" @click="emit('subscriptions')">
          <MessagesSquare />
          {{ t('nav_subscriptions', 'Subscriptions') }}
        </button>
        <button class="side-primary" type="button" @click="emit('tasks')">
          <Clock />
          {{ t('nav_tasks', 'Tasks') }}
        </button>
        <button class="side-primary" type="button" @click="emit('memories')">
          <BookOpen />
          {{ t('nav_memories', 'Memories') }}
        </button>
        <button class="side-primary" type="button" @click="emit('skills')">
          <ShieldCheck />
          {{ t('nav_skills', 'Skills') }}
        </button>
        <button class="side-primary" type="button" @click="emit('controls')">
          <MonitorSmartphone />
          {{ t('nav_controls', 'Controls') }}
        </button>
        <button class="side-primary" type="button" @click="emit('growth')">
          <Sprout />
          {{ t('nav_growth', 'Growth') }}
        </button>
      </div>
    </div>

    <div class="list">
      <div class="sec">
        {{ t('nav_apps', 'Apps') }}
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

      <div class="sec">{{ t('nav_chats', 'Chats') }}</div>
      <button
        v-for="chat in chats"
        :key="chat.id"
        class="chatitem"
        type="button"
        @click="emit('open-chat', chat)"
      >
        {{ formatChatTitle(chat) }}
      </button>
      <div v-if="!chats.length" class="nav-empty">{{ t('chat_history_empty', 'No conversations yet') }}</div>
    </div>

    <div class="nav-footer">
      <button class="settings-entry" type="button" @click="emit('settings')">
        <span class="settings-dot"></span>
        <span>
          <b>{{ t('nav_settings', 'Settings') }}</b>
          <small>{{ t('nav_settings_desc', 'Model and system prompt') }}</small>
        </span>
      </button>
    </div>
  </aside>
</template>
