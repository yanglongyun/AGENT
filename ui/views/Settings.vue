<script setup>
import { computed, inject, onMounted, reactive, ref, watch } from 'vue';
import { applyAppearance, normalizeLanguage, normalizeTheme } from '../lib/appearance.js';
import { t } from '../lib/locale.js';

const setPageNav = inject('pageNav');
const providerGroups = ref([]);
const providers = ref([]);
const status = ref('');
const loading = ref(false);
const error = ref('');
const activeTab = ref('model');
const promptPreview = ref({ custom: '', evolution: '', full: '' });
let previewTimer = null;

const settings = reactive({
  provider: 'openai',
  apiUrl: '',
  apiKey: '',
  model: '',
  system: '',
  evolution: '',
  compressThreshold: '12000',
  compactPrompt: '',
  toolResultMaxChars: '12000',
  toolVision: '0',
  theme: 'light',
  language: 'zh',
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
    settings.theme = normalizeTheme(settings.theme);
    settings.language = normalizeLanguage(settings.language);
    applyAppearance(settings);
    if (!settings.provider && providers.value.length) settings.provider = providers.value[0].id;
    if (!settings.apiUrl && activeProvider.value?.apiUrl) settings.apiUrl = activeProvider.value.apiUrl;
    if (!settings.model && activeProvider.value?.defaultModel) settings.model = activeProvider.value.defaultModel;
    await loadPromptPreview();
  } catch (err) {
    error.value = err.message || t('settings_load_failed', 'Load failed');
  } finally {
    loading.value = false;
  }
}

async function loadPromptPreview() {
  const res = await fetch('/api/settings/prompt-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  promptPreview.value = await res.json();
}

function schedulePromptPreview() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    loadPromptPreview().catch(() => {});
  }, 250);
}

async function saveSettings() {
  status.value = t('settings_saving', 'Saving...');
  error.value = '';
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    Object.assign(settings, await res.json());
    settings.theme = normalizeTheme(settings.theme);
    settings.language = normalizeLanguage(settings.language);
    applyAppearance(settings);
    await loadPromptPreview();
    status.value = t('settings_saved', 'Saved');
    setTimeout(() => { status.value = ''; }, 1200);
  } catch (err) {
    error.value = err.message || t('settings_save_failed', 'Save failed');
    status.value = '';
  }
}

function setTheme(value) {
  settings.theme = normalizeTheme(value);
  applyAppearance(settings);
}

function setLanguage(value) {
  settings.language = normalizeLanguage(value);
  applyAppearance(settings);
  setPageNav(t('nav_settings', 'Settings'), null, null, null);
}

onMounted(async () => {
  setPageNav(t('nav_settings', 'Settings'), null, null, null);
  await loadSettings();
  setPageNav(t('nav_settings', 'Settings'), null, null, null);
});

watch(
  () => [settings.system, settings.evolution, settings.model, settings.toolVision, settings.compressThreshold, settings.compactPrompt, settings.toolResultMaxChars],
  schedulePromptPreview,
);
</script>

<template>
  <section class="tasks-view">
    <div class="tasks-inner">
      <form class="settings-page" @submit.prevent="saveSettings">
        <div class="settings-page-head">
          <p>{{ t('settings_desc', 'Model, prompt, appearance, and project information') }}</p>
        </div>

        <div class="settings-tabs" role="tablist" aria-label="Settings sections">
          <button type="button" :class="{ active: activeTab === 'model' }" @click="activeTab = 'model'">{{ t('settings_tab_model', 'Model') }}</button>
          <button type="button" :class="{ active: activeTab === 'prompt' }" @click="activeTab = 'prompt'">{{ t('settings_tab_prompt', 'Prompt') }}</button>
          <button type="button" :class="{ active: activeTab === 'compaction' }" @click="activeTab = 'compaction'">{{ t('settings_tab_compaction', 'Compaction') }}</button>
          <button type="button" :class="{ active: activeTab === 'display' }" @click="activeTab = 'display'">{{ t('settings_tab_display', 'Display') }}</button>
          <button type="button" :class="{ active: activeTab === 'about' }" @click="activeTab = 'about'">{{ t('settings_tab_about', 'About') }}</button>
        </div>

        <div v-if="error" class="task-error">{{ error }}</div>
        <div v-if="loading" class="task-empty">{{ t('settings_loading', 'Loading settings...') }}</div>

        <template v-else>
          <div v-if="activeTab === 'model'" class="settings-panel">
            <label>
              {{ t('settings_provider', 'Provider') }}
              <select v-model="settings.provider" class="settings-select" @change="applyProviderDefaults">
                <optgroup v-for="group in groupedProviders" :key="group.id" :label="group.name">
                  <option v-for="provider in group.providers" :key="provider.id" :value="provider.id">
                    {{ provider.name }}
                  </option>
                </optgroup>
              </select>
            </label>
            <label>
              {{ t('settings_model', 'Model') }}
              <select v-if="activeProvider?.models?.length" v-model="settings.model" class="settings-select">
                <option v-for="model in activeProvider.models" :key="model" :value="model">{{ model }}</option>
              </select>
              <input v-else v-model="settings.model" :placeholder="t('settings_model', 'Model')" />
            </label>
            <label>
              {{ t('settings_api_url', 'API URL') }}
              <input v-model="settings.apiUrl" class="mono-input" placeholder="https://api.openai.com/v1/chat/completions" />
            </label>
            <label>
              {{ t('settings_api_key', 'API Key') }}
              <input v-model="settings.apiKey" class="mono-input" type="password" placeholder="sk-..." />
            </label>
            <label class="settings-toggle">
              <span>
                <b>{{ t('settings_tool_vision', 'Tool Vision') }}</b>
                <small>{{ t('settings_tool_vision_desc', 'Allow screenshot tool results to be used as visual context') }}</small>
              </span>
              <input
                type="checkbox"
                :checked="settings.toolVision === '1'"
                @change="settings.toolVision = $event.target.checked ? '1' : '0'"
              />
            </label>
            <label>
              {{ t('settings_tool_result_max_chars', 'Tool result limit') }}
              <input v-model="settings.toolResultMaxChars" type="number" min="1000" max="50000" step="1000" />
            </label>
          </div>

          <div v-else-if="activeTab === 'prompt'" class="settings-panel prompt-panel">
            <label>
              {{ t('settings_custom_prompt', 'Custom Prompt') }}
              <textarea v-model="settings.system" rows="8" :placeholder="t('settings_custom_prompt_placeholder', 'Optional custom system prompt')"></textarea>
            </label>
            <label>
              {{ t('settings_evolution', 'Evolution') }}
              <textarea v-model="settings.evolution" rows="6" :placeholder="t('settings_evolution_placeholder', 'Durable behavior updates or evolution instructions')"></textarea>
            </label>
            <label>
              {{ t('settings_full_prompt', 'Full Prompt') }}
              <textarea class="mono-input prompt-preview" :value="promptPreview.full" rows="16" readonly></textarea>
            </label>
          </div>

          <div v-else-if="activeTab === 'compaction'" class="settings-panel prompt-panel">
            <label>
              {{ t('settings_compress_threshold', 'Trigger total_tokens') }}
              <input v-model="settings.compressThreshold" type="number" min="0" step="100" />
            </label>
            <label>
              {{ t('settings_compact_prompt', 'Compaction Prompt') }}
              <textarea v-model="settings.compactPrompt" rows="10" :placeholder="t('settings_compact_prompt_placeholder', 'Prompt used to compress old messages into future context')"></textarea>
            </label>
          </div>

          <div v-else-if="activeTab === 'display'" class="settings-panel">
            <label>
              {{ t('settings_theme', 'Theme') }}
              <span class="settings-segment">
                <button type="button" :class="{ active: settings.theme === 'light' }" @click="setTheme('light')">{{ t('settings_theme_light', 'Light') }}</button>
                <button type="button" :class="{ active: settings.theme === 'dark' }" @click="setTheme('dark')">{{ t('settings_theme_dark', 'Dark') }}</button>
              </span>
            </label>
            <label>
              {{ t('settings_language', 'Language') }}
              <span class="settings-segment">
                <button type="button" :class="{ active: settings.language === 'zh' }" @click="setLanguage('zh')">中文</button>
                <button type="button" :class="{ active: settings.language === 'en' }" @click="setLanguage('en')">English</button>
              </span>
            </label>
          </div>

          <div v-else class="settings-panel about-panel">
            <h3>{{ t('settings_about_title', 'Agent Chat') }}</h3>
            <p>{{ t('settings_about_desc', 'A local AI workspace with chat, apps, background tasks, Controls, memory, skills, and configurable model settings.') }}</p>
            <a href="https://github.com/realuckyang/AGENT" target="_blank" rel="noreferrer">{{ t('settings_about_link', 'Open source repository') }}</a>
          </div>

          <div v-if="activeTab !== 'about'" class="settings-actions">
            <span>{{ status }}</span>
            <button class="primary-btn" type="submit">{{ t('settings_save', 'Save') }}</button>
          </div>
        </template>
      </form>
    </div>
  </section>
</template>
