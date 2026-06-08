<script setup>
import { Globe, Monitor } from '@lucide/vue';
import { inject, onMounted, ref } from 'vue';
import { getControls } from '../lib/api.js';

const setPageNav = inject('pageNav');
const controls = ref({
  browser: { connected: false, status: 'disconnected', detail: 'browser-use connector is not connected' },
  computer: { connected: false, status: 'disconnected', detail: 'computer-use connector is not connected', tools: [], drivers: {} }
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
    error.value = err.message || 'Load failed';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  setPageNav('Controls', null, null, null);
  await refresh();
});
</script>

<template>
  <section class="tasks-view asset-view">
    <div class="tasks-inner">
      <div class="asset-head">
        <button type="button" :disabled="loading" @click="refresh">Refresh</button>
      </div>
      <div v-if="error" class="task-error">{{ error }}</div>
      <div class="control-grid">
        <article class="control-card" :class="{ online: controls.browser.connected }">
          <div class="control-icon"><Globe /></div>
          <div class="control-main">
            <h3>Browser</h3>
            <p>{{ controls.browser.detail || 'browser-use connector is not connected' }}</p>
          </div>
          <span class="control-status"><i></i>{{ controls.browser.connected ? 'Online' : 'Not connected' }}</span>
        </article>

        <article class="control-card" :class="{ online: controls.computer.connected }">
          <div class="control-icon"><Monitor /></div>
          <div class="control-main">
            <h3>Computer</h3>
            <p>{{ controls.computer.detail || 'computer-use connector is not connected' }}</p>
            <small v-if="controls.computer.tools?.length">{{ controls.computer.tools.length }} actions available</small>
          </div>
          <span class="control-status"><i></i>{{ controls.computer.connected ? 'Online' : 'Not connected' }}</span>
        </article>
      </div>
    </div>
  </section>
</template>
