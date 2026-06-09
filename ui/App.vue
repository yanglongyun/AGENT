<script setup>
import { PanelLeft } from '@lucide/vue';
import { onMounted, onUnmounted, provide, reactive, ref } from 'vue';
import Sidebar from './components/Sidebar.vue';
import ChatView from './views/Chat.vue';
import ControlsView from './views/Controls.vue';
import GrowthView from './views/Growth.vue';
import MemoriesView from './views/Memories.vue';
import SettingsView from './views/Settings.vue';
import SkillsView from './views/Skills.vue';
import SubscriptionsView from './views/Subscriptions.vue';
import TasksView from './views/Tasks.vue';
import { t } from './lib/locale.js';

const nav = reactive({
  title: '',
  back: null,
  left: null,
  right: null,
});
const activeView = ref('chat');
const sidebarOpen = ref(true);
const isMobile = ref(false);
let viewportInitialized = false;

provide('pageNav', (title, back, left, right) => {
  nav.title = title || '';
  nav.back = back || null;
  nav.left = left || null;
  nav.right = right || null;
});

function requestNewChat() {
  activeView.value = 'chat';
  window.dispatchEvent(new CustomEvent('agent:new-chat'));
  closeSidebarOnMobile();
}

function requestOpenChat(chat) {
  activeView.value = 'chat';
  window.dispatchEvent(new CustomEvent('agent:open-chat', { detail: { chat } }));
  closeSidebarOnMobile();
}

function requestTasks() {
  activeView.value = 'tasks';
  closeSidebarOnMobile();
}

function requestSubscriptions() {
  activeView.value = 'subscriptions';
  closeSidebarOnMobile();
}

function requestGrowth() {
  activeView.value = 'growth';
  closeSidebarOnMobile();
}

function requestMemories() {
  activeView.value = 'memories';
  closeSidebarOnMobile();
}

function requestSkills() {
  activeView.value = 'skills';
  closeSidebarOnMobile();
}

function requestControls() {
  activeView.value = 'controls';
  closeSidebarOnMobile();
}

function requestSettings() {
  activeView.value = 'settings';
  closeSidebarOnMobile();
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}

function closeSidebarOnMobile() {
  if (isMobile.value) sidebarOpen.value = false;
}

function syncViewport() {
  const nextMobile = window.matchMedia('(max-width: 760px)').matches;
  if (!viewportInitialized || nextMobile !== isMobile.value) {
    isMobile.value = nextMobile;
    sidebarOpen.value = !nextMobile;
    viewportInitialized = true;
  }
}

onMounted(() => {
  syncViewport();
  window.addEventListener('resize', syncViewport);
});

onUnmounted(() => {
  window.removeEventListener('resize', syncViewport);
});
</script>

<template>
  <div class="app" :class="{ 'sidebar-collapsed': !sidebarOpen, 'sidebar-open': sidebarOpen }">
    <button v-if="isMobile && sidebarOpen" class="sidebar-scrim" type="button" aria-label="Close sidebar" @click="sidebarOpen = false"></button>
    <Sidebar
      @new-chat="requestNewChat"
      @open-chat="requestOpenChat"
      @tasks="requestTasks"
      @subscriptions="requestSubscriptions"
      @growth="requestGrowth"
      @memories="requestMemories"
      @skills="requestSkills"
      @controls="requestControls"
      @settings="requestSettings"
    />

    <main class="main">
      <header class="mhead">
        <button class="sidebar-toggle" type="button" aria-label="Toggle sidebar" :aria-expanded="sidebarOpen" @click="toggleSidebar">
          <PanelLeft />
        </button>
        <button v-if="nav.back" class="back-btn" type="button" aria-label="Back" @click="nav.back">
          &lt;
        </button>
        <b>{{ nav.title || t('chat_title', 'Agent Chat') }}</b>
        <span class="spacer"></span>
      </header>

      <div class="chat-stage">
        <ChatView v-if="activeView === 'chat'" />
        <TasksView v-else-if="activeView === 'tasks'" />
        <SubscriptionsView v-else-if="activeView === 'subscriptions'" />
        <GrowthView v-else-if="activeView === 'growth'" />
        <MemoriesView v-else-if="activeView === 'memories'" />
        <SkillsView v-else-if="activeView === 'skills'" />
        <ControlsView v-else-if="activeView === 'controls'" />
        <SettingsView v-else />
      </div>
    </main>
  </div>
</template>
