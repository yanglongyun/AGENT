<template>
  <div class="app-page">
    <div v-if="mode === 'list'" class="app-inner">
      <div class="app-head">
        <div>
          <h2>Todo</h2>
          <p>{{ todayLabel }} · 今天完成 {{ doneToday }} / {{ todayTodos.length }}</p>
        </div>
        <button class="app-primary" type="button" @click="openAdd">
          <Plus :size="16" />
          添加
        </button>
      </div>

      <div class="app-card soft app-row">
        <div class="app-pill accent">{{ progressPercent }}%</div>
        <div class="app-main">
          <b>{{ remainingToday > 0 ? `还有 ${remainingToday} 项` : '今天全部搞定' }}</b>
          <small>AI 拆解会把单条待办拆成可勾选的子任务。</small>
        </div>
      </div>

      <div v-if="error" class="app-error">{{ error }}</div>

      <template v-if="todos.length">
        <div v-if="todayTodos.length" class="app-section-title">Today</div>
        <div
          v-for="todo in todayTodos"
          :key="todo.id"
          class="app-card app-row start"
          :class="{ done: todo.done }"
        >
          <button class="app-check" :class="{ done: todo.done }" type="button" @click="toggleTodo(todo)">
            <Check :size="14" :stroke-width="3" />
          </button>
          <div class="app-main">
            <b :class="{ 'line-through': todo.done }">{{ todo.text }}</b>
            <small>{{ todo.priority === 'high' ? '高优先级' : '普通' }}</small>

            <div v-if="!todo.done && todo.subtasks?.length" class="app-subtasks">
              <div v-for="subtask in todo.subtasks" :key="subtask.id" class="app-subtask">
                <button class="app-check" :class="{ done: subtask.done }" type="button" @click="toggleSubtask(todo, subtask)">
                  <Check :size="12" :stroke-width="3" />
                </button>
                <span :class="{ 'line-through': subtask.done }">{{ subtask.text }}</span>
              </div>
            </div>

            <button
              v-if="!todo.done && !todo.subtasks?.length"
              class="app-ghost mt-3"
              type="button"
              :disabled="decomposingId === todo.id"
              @click="decompose(todo)"
            >
              <Sparkles :size="14" />
              {{ decomposingId === todo.id ? '拆解中' : 'AI 拆解' }}
            </button>
          </div>
          <button class="app-icon" type="button" aria-label="删除待办" @click="remove(todo.id)">
            <Trash2 :size="16" />
          </button>
        </div>

        <div v-if="laterTodos.length" class="app-section-title">Later</div>
        <div
          v-for="todo in laterTodos"
          :key="todo.id"
          class="app-card app-row start"
          :class="{ done: todo.done }"
        >
          <button class="app-check" :class="{ done: todo.done }" type="button" @click="toggleTodo(todo)">
            <Check :size="14" :stroke-width="3" />
          </button>
          <div class="app-main">
            <b :class="{ 'line-through': todo.done }">{{ todo.text }}</b>
            <small>{{ todo.priority === 'high' ? '高优先级' : '稍后' }}</small>
          </div>
          <button class="app-icon" type="button" aria-label="删除待办" @click="remove(todo.id)">
            <Trash2 :size="16" />
          </button>
        </div>
      </template>

      <div v-else class="app-empty">还没有待办</div>
    </div>

    <div v-else class="app-inner">
      <div class="app-head">
        <div class="app-row">
          <button class="app-icon" type="button" aria-label="返回" @click="closeAdd">
            <ChevronLeft :size="18" />
          </button>
          <div>
            <h2>新待办</h2>
            <p>创建一条任务，之后可以让 AI 拆解。</p>
          </div>
        </div>
      </div>

      <div class="app-card">
        <div class="app-section-title">Content</div>
        <input v-model="form.text" class="app-input" placeholder="要做什么？" @keyup.enter="add" />

        <div class="app-section-title">When</div>
        <div class="app-segment">
          <button :class="{ active: form.section === 'today' }" type="button" @click="form.section = 'today'">今天</button>
          <button :class="{ active: form.section === 'later' }" type="button" @click="form.section = 'later'">稍后</button>
        </div>

        <div class="app-section-title">Priority</div>
        <button class="app-ghost" type="button" @click="form.priority = form.priority === 'high' ? '' : 'high'">
          {{ form.priority === 'high' ? '已标记高优先级' : '标记高优先级' }}
        </button>

        <div v-if="error" class="app-error mt-3">{{ error }}</div>

        <div class="app-actions mt-4">
          <button class="app-primary" type="button" :disabled="saving || !form.text.trim()" @click="add">
            {{ saving ? '添加中' : '添加' }}
          </button>
          <button class="app-ghost" type="button" @click="closeAdd">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Check, ChevronLeft, Plus, Sparkles, Trash2 } from '@lucide/vue';
import { computed, onMounted, reactive, ref } from 'vue';

const todos = ref([]);
const mode = ref('list');
const saving = ref(false);
const decomposingId = ref(null);
const error = ref('');
const form = reactive({ text: '', section: 'today', priority: '' });

const todayTodos = computed(() => todos.value.filter((todo) => todo.section !== 'later'));
const laterTodos = computed(() => todos.value.filter((todo) => todo.section === 'later'));
const doneToday = computed(() => todayTodos.value.filter((todo) => todo.done).length);
const remainingToday = computed(() => Math.max(0, todayTodos.value.length - doneToday.value));
const progressPercent = computed(() => todayTodos.value.length ? Math.round((doneToday.value / todayTodos.value.length) * 100) : 0);
const todayLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date()));

const request = async (url, options = {}) => {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

const load = async () => {
  const data = await request('/apps/todo/todos');
  todos.value = data.todos || [];
};

const openAdd = () => {
  mode.value = 'add';
  form.text = '';
  form.section = 'today';
  form.priority = '';
  error.value = '';
};

const closeAdd = () => {
  if (saving.value) return;
  mode.value = 'list';
  error.value = '';
};

const add = async () => {
  const text = form.text.trim();
  if (!text || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await request('/apps/todo/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, section: form.section, priority: form.priority }),
    });
    mode.value = 'list';
    await load();
  } catch (err) {
    error.value = err.message || '添加失败';
  } finally {
    saving.value = false;
  }
};

const patchTodo = async (todo, patch) => {
  const data = await request(`/apps/todo/todos?id=${encodeURIComponent(todo.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const next = data.todo;
  todos.value = todos.value.map((item) => item.id === next.id ? next : item);
};

const toggleTodo = async (todo) => {
  await patchTodo(todo, { done: !todo.done });
};

const toggleSubtask = async (todo, subtask) => {
  const subtasks = (todo.subtasks || []).map((item) => item.id === subtask.id ? { ...item, done: !item.done } : item);
  await patchTodo(todo, { subtasks });
};

const decompose = async (todo) => {
  if (decomposingId.value) return;
  decomposingId.value = todo.id;
  error.value = '';
  try {
    const data = await request('/apps/todo/decompose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: todo.text }),
    });
    await patchTodo(todo, { subtasks: data.subtasks || [] });
  } catch (err) {
    error.value = err.message || '拆解失败';
  } finally {
    decomposingId.value = null;
  }
};

const remove = async (id) => {
  await request(`/apps/todo/todos?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  await load();
};

onMounted(load);
</script>
