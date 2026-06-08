<script setup>
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { listSubscriptions } from '../lib/api.js';

const setPageNav = inject('pageNav');
const subscriptions = ref([]);
const loading = ref(false);
const error = ref('');
let timer = null;

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await listSubscriptions(200);
    subscriptions.value = data.subscriptions || [];
  } catch (err) {
    error.value = err.message || 'Load failed';
  } finally {
    loading.value = false;
  }
}

function formatTime(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 19);
}

onMounted(async () => {
  setPageNav('Agent', null, null, null);
  await refresh();
  timer = setInterval(refresh, 2500);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <section class="tasks-view">
    <div class="tasks-inner">
      <div class="asset-head">
        <h2>Subscriptions</h2>
      </div>
      <div v-if="error" class="task-error">{{ error }}</div>
      <div v-if="loading && !subscriptions.length" class="task-empty">Loading subscriptions...</div>
      <div v-else-if="!subscriptions.length" class="task-empty">No subscriptions yet</div>

      <div v-else class="task-list">
        <article v-for="subscription in subscriptions" :key="subscription.id" class="subscription-row">
          <div class="subscription-head">
            <b>#{{ subscription.id }}</b>
            <span class="task-status">{{ subscription.status }}</span>
          </div>
          <div class="subscription-grid">
            <span>Task</span>
            <code>{{ subscription.task_id }}</code>
            <span>Chat</span>
            <code>{{ subscription.chat_id }}</code>
            <span>Created</span>
            <code>{{ formatTime(subscription.created_at) }}</code>
            <span>Fired</span>
            <code>{{ formatTime(subscription.fired_at) }}</code>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
