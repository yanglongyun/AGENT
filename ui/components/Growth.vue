<script setup>
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { listUpdates } from '../lib/api.js';

const setPageNav = inject('pageNav');
const updates = ref([]);
const loading = ref(false);
const error = ref('');
let timer = null;

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await listUpdates(200);
    updates.value = data.updates || [];
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
  timer = setInterval(refresh, 3000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <section class="tasks-view">
    <div class="tasks-inner">
      <div class="asset-head">
        <h2>Growth</h2>
      </div>
      <div v-if="error" class="task-error">{{ error }}</div>
      <div v-if="loading && !updates.length" class="task-empty">Loading growth updates...</div>
      <div v-else-if="!updates.length" class="task-empty">No growth updates yet</div>

      <div v-else class="task-list">
        <article v-for="update in updates" :key="update.id" class="growth-row">
          <div class="subscription-head">
            <b>v{{ update.version }} · {{ update.title }}</b>
            <span class="task-status">{{ formatTime(update.created_at) }}</span>
          </div>
          <p>{{ update.description || 'No description' }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
