<script setup>
import { computed, inject, onMounted, onUnmounted, ref } from 'vue';
import { abortTask, getTask, listTasks } from '../lib/api.js';

const setPageNav = inject('pageNav');

const tasks = ref([]);
const currentTaskId = ref(null);
const currentTask = ref(null);
const taskMessages = ref([]);
const loading = ref(false);
const error = ref('');
const stopping = ref(false);
let timer = null;

const statusText = (status) => ({
  pending: 'Pending',
  running: 'Running',
  done: 'Done',
  error: 'Error',
  aborted: 'Aborted',
}[status] || status || '-');

const isActive = (task) => ['pending', 'running'].includes(task?.status);
const visibleTask = computed(() => currentTask.value || tasks.value.find((task) => task.id === currentTaskId.value) || null);

function setListNav() {
  setPageNav('Agent', null, null, null);
}

function closeDetail() {
  currentTaskId.value = null;
  currentTask.value = null;
  taskMessages.value = [];
  setListNav();
}

function setDetailNav() {
  setPageNav('Agent', null, null, null);
}

async function loadTasks() {
  loading.value = true;
  error.value = '';
  try {
    const data = await listTasks(200);
    tasks.value = data.tasks || [];
  } catch (err) {
    error.value = err.message || 'Load failed';
  } finally {
    loading.value = false;
  }
}

async function loadTask(id) {
  if (!id) return;
  error.value = '';
  try {
    const data = await getTask(id);
    currentTask.value = data.task || null;
    taskMessages.value = Array.isArray(data.messages) ? data.messages : [];
    setDetailNav(currentTask.value);
  } catch (err) {
    error.value = err.message || 'Load failed';
  }
}

async function openTask(task) {
  currentTaskId.value = task.id;
  currentTask.value = task;
  setDetailNav(task);
  await loadTask(task.id);
}

async function stopTask() {
  const task = visibleTask.value;
  if (!task || !isActive(task) || stopping.value) return;
  stopping.value = true;
  error.value = '';
  try {
    const data = await abortTask(task.id);
    currentTask.value = data.task || task;
    await loadTasks();
  } catch (err) {
    error.value = err.message || 'Abort failed';
  } finally {
    stopping.value = false;
  }
}

function formatTime(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 19);
}

function messageRole(row) {
  const role = row?.message?.role || 'unknown';
  const source = row?.meta?.source || '';
  return source ? `${role} · ${source}` : role;
}

function messageText(row) {
  const msg = row?.message || {};
  if (typeof msg.content === 'string' && msg.content) return msg.content;
  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
    return msg.tool_calls.map((call) => {
      const name = call?.function?.name || 'tool';
      const args = call?.function?.arguments || '{}';
      return `${name} ${args}`;
    }).join('\n');
  }
  return JSON.stringify(msg, null, 2);
}

function startPolling() {
  timer = setInterval(async () => {
    await loadTasks();
    if (currentTaskId.value) await loadTask(currentTaskId.value);
  }, 2500);
}

onMounted(async () => {
  setListNav();
  await loadTasks();
  startPolling();
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <section class="tasks-view">
    <div v-if="!currentTaskId" class="tasks-inner">
      <div class="asset-head">
        <h2>Tasks</h2>
      </div>
      <div v-if="error" class="task-error">{{ error }}</div>
      <div v-if="loading && !tasks.length" class="task-empty">Loading tasks...</div>
      <div v-else-if="!tasks.length" class="task-empty">No system tasks yet</div>

      <div v-else class="task-list">
        <button
          v-for="task in tasks"
          :key="task.id"
          class="task-row"
          type="button"
          @click="openTask(task)"
        >
          <span class="task-state" :class="task.status"></span>
          <span class="task-main">
            <b>{{ task.name }}</b>
            <small>{{ task.prompt }}</small>
          </span>
          <span class="task-status">{{ statusText(task.status) }}</span>
        </button>
      </div>
    </div>

    <div v-else class="tasks-inner">
      <div v-if="error" class="task-error">{{ error }}</div>
      <article v-if="visibleTask" class="task-detail">
        <div class="task-detail-head">
          <div>
            <h2>{{ visibleTask.name }}</h2>
            <p>#{{ visibleTask.id }} · {{ statusText(visibleTask.status) }}</p>
          </div>
          <div class="task-head-actions">
            <button type="button" @click="closeDetail">Back</button>
            <button v-if="isActive(visibleTask)" type="button" :disabled="stopping" @click="stopTask">
              {{ stopping ? 'Stopping...' : 'Stop' }}
            </button>
          </div>
        </div>

        <div class="task-meta">
          <span>Created {{ formatTime(visibleTask.created_at) }}</span>
          <span>Finished {{ formatTime(visibleTask.finished_at) }}</span>
        </div>

        <section>
          <h3>Prompt</h3>
          <pre>{{ visibleTask.prompt }}</pre>
        </section>

        <section v-if="visibleTask.response">
          <h3>Response</h3>
          <pre>{{ visibleTask.response }}</pre>
        </section>

        <section v-if="visibleTask.error">
          <h3>Error</h3>
          <pre class="danger">{{ visibleTask.error }}</pre>
        </section>

        <section v-if="taskMessages.length">
          <h3>Chat record</h3>
          <div class="task-message-list">
            <div v-for="row in taskMessages" :key="row.id" class="task-message">
              <div class="task-message-role">{{ messageRole(row) }}</div>
              <pre>{{ messageText(row) }}</pre>
            </div>
          </div>
        </section>
      </article>
    </div>
  </section>
</template>
