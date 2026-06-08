<script setup>
import { computed, inject, onMounted, reactive, ref } from 'vue';

const setPageNav = inject('pageNav');
const providerGroups = ref([]);
const providers = ref([]);
const status = ref('');
const loading = ref(false);
const error = ref('');

const settings = reactive({
  provider: 'openai',
  apiUrl: '',
  apiKey: '',
  model: '',
  system: '',
  contextTurns: '100',
});

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

async function loadSettings() {
  loading.value = true;
  error.value = '';
  status.value = '';
  try {
    const [settingsRes, modelsRes] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/settings/models'),
    ]);
    const settingsData = await settingsRes.json();
    const modelsData = await modelsRes.json();
    providerGroups.value = modelsData.groups || [];
    providers.value = modelsData.providers || [];
    Object.assign(settings, settingsData);
    if (!settings.provider && providers.value.length) settings.provider = providers.value[0].id;
    if (!settings.apiUrl && activeProvider.value?.apiUrl) settings.apiUrl = activeProvider.value.apiUrl;
    if (!settings.model && activeProvider.value?.defaultModel) settings.model = activeProvider.value.defaultModel;
  } catch (err) {
    error.value = err.message || 'Load failed';
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  status.value = 'Saving...';
  error.value = '';
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    Object.assign(settings, await res.json());
    status.value = 'Saved';
    setTimeout(() => { status.value = ''; }, 1200);
  } catch (err) {
    error.value = err.message || 'Save failed';
    status.value = '';
  }
}

onMounted(async () => {
  setPageNav('Settings', null, null, null);
  await loadSettings();
});
</script>

<template>
  <section class="tasks-view">
    <div class="tasks-inner">
      <form class="settings-page" @submit.prevent="saveSettings">
        <div class="settings-page-head">
          <div>
            <h2>Model Settings</h2>
            <p>OpenAI-compatible chat completions endpoint</p>
          </div>
        </div>

        <div v-if="error" class="task-error">{{ error }}</div>
        <div v-if="loading" class="task-empty">Loading settings...</div>

        <template v-else>
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
            <textarea v-model="settings.system" rows="8" placeholder="Optional custom system prompt"></textarea>
          </label>

          <div class="settings-actions">
            <span>{{ status }}</span>
            <button class="primary-btn" type="submit">Save</button>
          </div>
        </template>
      </form>
    </div>
  </section>
</template>
