<script setup>
import { PanelLeft } from '@lucide/vue';
import { onMounted, onUnmounted, provide, reactive, ref } from 'vue';
import AppsView from './components/Apps.vue';
import ChatView from './components/Chat.vue';
import ControlsView from './components/Controls.vue';
import GrowthView from './components/Growth.vue';
import MemoriesView from './components/Memories.vue';
import Sidebar from './components/Sidebar.vue';
import SettingsView from './components/Settings.vue';
import SkillsView from './components/Skills.vue';
import SubscriptionsView from './components/Subscriptions.vue';
import TasksView from './components/Tasks.vue';

const nav = reactive({
  title: 'Agent Chat',
  back: null,
  left: null,
  right: null,
});
const activeView = ref('chat');
const activeAppId = ref('');
const sidebarOpen = ref(true);
const isMobile = ref(false);
let viewportInitialized = false;

provide('pageNav', (title, back, left, right) => {
  nav.title = title || 'Agent Chat';
  nav.back = back || null;
  nav.left = left || null;
  nav.right = right || null;
});

function requestNewChat() {
  activeView.value = 'chat';
  activeAppId.value = '';
  window.dispatchEvent(new CustomEvent('agent:new-chat'));
  closeSidebarOnMobile();
}

function requestOpenChat(chat) {
  activeView.value = 'chat';
  activeAppId.value = '';
  window.dispatchEvent(new CustomEvent('agent:open-chat', { detail: { chat } }));
  closeSidebarOnMobile();
}

function requestOpenApp(appId) {
  activeAppId.value = appId;
  activeView.value = 'app';
  closeSidebarOnMobile();
}

function requestTasks() {
  activeView.value = 'tasks';
  activeAppId.value = '';
  closeSidebarOnMobile();
}

function requestSubscriptions() {
  activeView.value = 'subscriptions';
  activeAppId.value = '';
  closeSidebarOnMobile();
}

function requestGrowth() {
  activeView.value = 'growth';
  activeAppId.value = '';
  closeSidebarOnMobile();
}

function requestMemories() {
  activeView.value = 'memories';
  activeAppId.value = '';
  closeSidebarOnMobile();
}

function requestSkills() {
  activeView.value = 'skills';
  activeAppId.value = '';
  closeSidebarOnMobile();
}

function requestControls() {
  activeView.value = 'controls';
  activeAppId.value = '';
  closeSidebarOnMobile();
}

function requestSettings() {
  activeView.value = 'settings';
  activeAppId.value = '';
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
      @open-app="requestOpenApp"
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
        <b>{{ nav.title || 'Agent Chat' }}</b>
        <span class="spacer"></span>
      </header>

      <div class="chat-stage">
        <ChatView v-if="activeView === 'chat'" />
        <AppsView v-else-if="activeView === 'app'" :app-id="activeAppId" @open-app="requestOpenApp" />
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
