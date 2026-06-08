<script setup>
import { Globe, Monitor } from '@lucide/vue';
import { inject, onMounted, ref } from 'vue';
import { getControls } from '../lib/api.js';
import { t } from '../lib/locale.js';

const setPageNav = inject('pageNav');
const controls = ref({
  browser: { connected: false, status: 'disconnected', detail: '' },
  computer: { connected: false, status: 'disconnected', detail: '', tools: [], drivers: {} }
});
const loading = ref(false);
const error = ref('');

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await getControls();
    controls.value = data.controls || controls.value;
  } catch (err) {
    error.value = err.message || t('common_load_failed', 'Load failed');
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  setPageNav(t('nav_controls', 'Controls'), null, null, null);
  await refresh();
});
</script>

<template>
  <section class="tasks-view asset-view">
    <div class="tasks-inner">
      <div class="asset-head">
        <button type="button" :disabled="loading" @click="refresh">{{ t('common_refresh', 'Refresh') }}</button>
      </div>
      <div v-if="error" class="task-error">{{ error }}</div>
      <div class="control-grid">
        <article class="control-card" :class="{ online: controls.browser.connected }">
          <div class="control-icon"><Globe /></div>
          <div class="control-main">
            <h3>{{ t('controls_browser', 'Browser') }}</h3>
            <p>{{ controls.browser.detail || t('controls_browser_disconnected', 'browser-use connector is not connected') }}</p>
          </div>
          <span class="control-status"><i></i>{{ controls.browser.connected ? t('common_online', 'Online') : t('common_not_connected', 'Not connected') }}</span>
        </article>

        <article class="control-card" :class="{ online: controls.computer.connected }">
          <div class="control-icon"><Monitor /></div>
          <div class="control-main">
            <h3>{{ t('controls_computer', 'Computer') }}</h3>
            <p>{{ controls.computer.detail || t('controls_computer_disconnected', 'computer-use connector is not connected') }}</p>
            <small v-if="controls.computer.tools?.length">{{ t('controls_actions_available', '{n} actions available', { n: controls.computer.tools.length }) }}</small>
          </div>
          <span class="control-status"><i></i>{{ controls.computer.connected ? t('common_online', 'Online') : t('common_not_connected', 'Not connected') }}</span>
        </article>
      </div>
    </div>
  </section>
</template>
