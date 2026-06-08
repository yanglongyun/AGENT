<script setup>
import { computed, onMounted, onUnmounted, provide, reactive, ref } from 'vue';
import ChatView from './components/Chat.vue';
import MemoriesView from './components/Memories.vue';
import Sidebar from './components/Sidebar.vue';
import SkillsView from './components/Skills.vue';
import SubscriptionsView from './components/Subscriptions.vue';
import TasksView from './components/Tasks.vue';

const nav = reactive({
  title: 'Agent Chat',
  back: null,
  left: null,
  right: null,
});
const showSettings = ref(false);
const activeView = ref('chat');
const providerGroups = ref([]);
const providers = ref([]);
const sidebarOpen = ref(true);
const isMobile = ref(false);
let viewportInitialized = false;

provide('pageNav', (title, back, left, right) => {
  nav.title = title || 'Agent Chat';
  nav.back = back || null;
  nav.left = left || null;
  nav.right = right || null;
});

const settings = reactive({
  provider: 'openai',
  apiUrl: '',
  apiKey: '',
  model: '',
  system: '',
  contextTurns: '100',
});
const settingsStatus = ref('');
const activeProvider = computed(() => providers.value.find((item) => item.id === settings.provider) || null);
const groupedProviders = computed(() => {
  const buckets = new Map(providerGroups.value.map((group) => [group.id, { ...group, providers: [] }]));
  const other = { id: 'other', name: 'Other', providers: [] };
  for (const provider of providers.value) {
    const group = buckets.get(provider.group);
    if (group) group.providers.push(provider);
    else other.providers.push(provider);
  }
  const list = [...buckets.values()].filter((group) => group.providers.length);
  if (other.providers.length) list.push(other);
  return list;
});

function applyProviderDefaults() {
  const provider = activeProvider.value;
  if (!provider) return;
  settings.apiUrl = provider.apiUrl || '';
  settings.model = provider.defaultModel || '';
}

async function openSettings() {
  showSettings.value = true;
  settingsStatus.value = '';
  const [settingsRes, modelsRes] = await Promise.all([
    fetch('/api/settings'),
    fetch('/api/settings/models'),
  ]);
  const settingsData = await settingsRes.json();
  const modelsData = await modelsRes.json();
  providerGroups.value = modelsData.groups || [];
  providers.value = modelsData.providers || [];
  Object.assign(settings, settingsData);
  if (!settings.provider && providers.value.length) {
    settings.provider = providers.value[0].id;
  }
  if (!settings.apiUrl && activeProvider.value?.apiUrl) {
    settings.apiUrl = activeProvider.value.apiUrl;
  }
  if (!settings.model && activeProvider.value?.defaultModel) {
    settings.model = activeProvider.value.defaultModel;
  }
}

async function saveSettings() {
  settingsStatus.value = 'Saving...';
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  Object.assign(settings, await res.json());
  settingsStatus.value = 'Saved';
  setTimeout(() => { settingsStatus.value = ''; }, 1200);
}

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

function requestMemories() {
  activeView.value = 'memories';
  closeSidebarOnMobile();
}

function requestSkills() {
  activeView.value = 'skills';
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
      @memories="requestMemories"
      @skills="requestSkills"
      @settings="openSettings(); closeSidebarOnMobile()"
    />

    <main class="main">
      <header class="mhead">
        <button class="hamburger" type="button" aria-label="Toggle sidebar" :aria-expanded="sidebarOpen" @click="toggleSidebar">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <button v-if="nav.back" class="back-btn" type="button" aria-label="Back" @click="nav.back">
          &lt;
        </button>
        <b>{{ nav.title || 'Agent Chat' }}</b>
        <span class="spacer"></span>
      </header>

      <div class="chat-stage">
        <ChatView v-if="activeView === 'chat'" />
        <TasksView v-else-if="activeView === 'tasks'" />
        <SubscriptionsView v-else-if="activeView === 'subscriptions'" />
        <MemoriesView v-else-if="activeView === 'memories'" />
        <SkillsView v-else />
      </div>
    </main>

    <div v-if="showSettings" class="modal-backdrop" @click.self="showSettings = false">
      <form class="settings-modal" @submit.prevent="saveSettings">
        <div class="modal-head">
          <div>
            <h2>Model Settings</h2>
            <p>OpenAI-compatible chat completions endpoint</p>
          </div>
          <button class="icon-btn" type="button" @click="showSettings = false">×</button>
        </div>

        <label>
          Provider
          <select v-model="settings.provider" class="settings-select" @change="applyProviderDefaults">
            <optgroup v-for="group in groupedProviders" :key="group.id" :label="group.name">
              <option v-for="provider in group.providers" :key="provider.id" :value="provider.id">
                {{ provider.name }}
              </option>
            </optgroup>
          </select>
        </label>
        <label>
          Model
          <select v-if="activeProvider?.models?.length" v-model="settings.model" class="settings-select">
            <option v-for="model in activeProvider.models" :key="model" :value="model">{{ model }}</option>
          </select>
          <input v-else v-model="settings.model" placeholder="model name" />
        </label>
        <label>
          API URL
          <input v-model="settings.apiUrl" class="mono-input" placeholder="https://api.openai.com/v1/chat/completions" />
        </label>
        <label>
          API Key
          <input v-model="settings.apiKey" class="mono-input" type="password" placeholder="sk-..." />
        </label>
        <label>
          Context Turns
          <input v-model="settings.contextTurns" type="number" min="1" max="200" />
        </label>
        <label>
          System Prompt
          <textarea v-model="settings.system" rows="5" placeholder="Optional custom system prompt"></textarea>
        </label>

        <div class="modal-actions">
          <span>{{ settingsStatus }}</span>
          <button class="text-btn" type="button" @click="showSettings = false">Cancel</button>
          <button class="primary-btn" type="submit">Save</button>
        </div>
      </form>
    </div>
  </div>
</template>
