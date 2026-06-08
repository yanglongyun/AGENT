<template>
  <div class="app-page">
    <div v-if="!editing" class="app-inner">
      <div class="app-head">
        <div>
          <p>{{ notes.length }} 篇笔记</p>
        </div>
        <button class="app-primary" type="button" @click="openEditor()">
          <Plus :size="16" />
          新笔记
        </button>
      </div>

      <div class="app-card">
        <div class="app-row">
          <Search :size="17" class="app-muted" />
          <input v-model="search" class="app-input" placeholder="搜索笔记" />
        </div>
      </div>

      <div v-if="!filteredNotes.length" class="app-empty">
        {{ search.trim() ? '没有匹配的笔记' : '还没有笔记' }}
      </div>

      <button
        v-for="note in filteredNotes"
        v-else
        :key="note.id"
        class="app-card app-row start"
        type="button"
        @click="openEditor(note)"
      >
        <div class="app-main">
          <b>{{ note.title || firstLine(note.content) || '无标题' }}</b>
          <small>{{ note.content || '空笔记' }}</small>
          <div class="app-actions mt-2">
            <span class="app-pill accent">笔记</span>
            <span class="app-muted">{{ note.updated_at || note.created_at }}</span>
          </div>
        </div>
      </button>
    </div>

    <div v-else class="app-inner">
      <div class="app-head">
        <div class="app-row">
          <button class="app-icon" type="button" aria-label="返回" @click="closeEditor">
            <ChevronLeft :size="18" />
          </button>
          <div>
            <h2>{{ editing.id ? '编辑笔记' : '新笔记' }}</h2>
            <p>写作内容可以交给 AI 润色、精简或扩写。</p>
          </div>
        </div>
      </div>

      <div class="app-card">
        <input v-model="form.title" class="app-input" placeholder="标题" />
        <textarea v-model="form.content" class="app-textarea mt-3" placeholder="写点什么..." />

        <div class="app-card soft mt-3">
          <div class="app-section-title">AI</div>
          <div class="app-grid-3">
            <button
              v-for="mode in aiModes"
              :key="mode.id"
              class="app-ghost"
              type="button"
              :disabled="aiBusy || !form.content.trim()"
              @click="runAi(mode.id)"
            >
              <component :is="mode.icon" :size="14" />
              {{ aiBusy && aiMode === mode.id ? '处理中' : mode.label }}
            </button>
          </div>

          <div v-if="aiResult && !aiBusy" class="app-card mt-3">
            <div class="app-section-title">Result</div>
            <div class="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--ink2)]">{{ aiResult }}</div>
            <div class="app-actions mt-3">
              <button class="app-primary" type="button" @click="acceptAi">采纳</button>
              <button class="app-ghost" type="button" @click="aiResult = ''">放弃</button>
            </div>
          </div>

          <div v-if="aiBusy" class="app-muted mt-3">{{ activeAiLabel }}中...</div>
        </div>

        <div v-if="error" class="app-error mt-3">{{ error }}</div>

        <div class="app-actions mt-4">
          <button
            v-if="editing.id"
            class="app-danger"
            type="button"
            @click="remove(editing.id)"
          >
            <Trash2 :size="15" />
            删除
          </button>
          <span class="app-main"></span>
          <button class="app-ghost" type="button" @click="closeEditor">取消</button>
          <button
            class="app-primary"
            type="button"
            :disabled="saving || (!form.title.trim() && !form.content.trim())"
            @click="save"
          >
            {{ saving ? '保存中' : editing.id ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ChevronLeft, Expand, Plus, Scissors, Search, Trash2, WandSparkles } from '@lucide/vue';
import { computed, onMounted, reactive, ref } from 'vue';

const notes = ref([]);
const search = ref('');
const editing = ref(null);
const saving = ref(false);
const aiBusy = ref(false);
const aiMode = ref('polish');
const aiResult = ref('');
const error = ref('');

const form = reactive({ title: '', content: '' });

const aiModes = [
  { id: 'polish', label: '润色', icon: WandSparkles },
  { id: 'condense', label: '精简', icon: Scissors },
  { id: 'expand', label: '扩写', icon: Expand },
];

const activeAiLabel = computed(() => aiModes.find((mode) => mode.id === aiMode.value)?.label || '润色');
const filteredNotes = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return notes.value;
  return notes.value.filter((note) => `${note.title || ''}\n${note.content || ''}`.toLowerCase().includes(q));
});

const firstLine = (text = '') => String(text).trim().split(/\r?\n/)[0] || '';

const request = async (url, options = {}) => {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

const load = async () => {
  const data = await request('/apps/notepad/notes');
  notes.value = data.notes || [];
};

const resetAi = () => {
  aiBusy.value = false;
  aiResult.value = '';
  error.value = '';
  aiMode.value = 'polish';
};

const openEditor = (note = null) => {
  editing.value = note ? { ...note } : {};
  form.title = note?.title || '';
  form.content = note?.content || '';
  resetAi();
};

const closeEditor = () => {
  if (aiBusy.value || saving.value) return;
  editing.value = null;
  resetAi();
};

const runAi = async (mode = 'polish') => {
  const content = form.content.trim();
  if (!content || aiBusy.value) return;
  aiMode.value = mode;
  aiBusy.value = true;
  aiResult.value = '';
  error.value = '';
  try {
    const data = await request('/apps/notepad/polish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, content }),
    });
    aiResult.value = data.result?.content || '';
    if (!aiResult.value) error.value = '没有生成可用结果';
  } catch (err) {
    error.value = err.message || 'AI 处理失败';
  } finally {
    aiBusy.value = false;
  }
};

const acceptAi = () => {
  if (!aiResult.value) return;
  form.content = aiResult.value;
  aiResult.value = '';
};

const save = async () => {
  if (saving.value) return;
  const content = form.content.trim();
  const title = form.title.trim() || firstLine(content).slice(0, 24) || '无标题';
  if (!title && !content) return;
  saving.value = true;
  error.value = '';
  try {
    const payload = { title, content };
    if (editing.value?.id) {
      await request(`/apps/notepad/notes?id=${encodeURIComponent(editing.value.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await request('/apps/notepad/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    editing.value = null;
    resetAi();
    await load();
  } catch (err) {
    error.value = err.message || '保存失败';
  } finally {
    saving.value = false;
  }
};

const remove = async (id) => {
  if (saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await request(`/apps/notepad/notes?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    editing.value = null;
    resetAi();
    await load();
  } catch (err) {
    error.value = err.message || '删除失败';
  } finally {
    saving.value = false;
  }
};

onMounted(load);
</script>
