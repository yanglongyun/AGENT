<script setup>
import { computed, inject, onMounted, reactive, ref } from 'vue';
import { createMemory, deleteMemory, listMemories, updateMemory } from '../lib/api.js';
import { t } from '../lib/locale.js';

const setPageNav = inject('pageNav');
const memories = ref([]);
const selectedId = ref(null);
const mode = ref('list');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const form = reactive({
  title: '',
  description: '',
  body: '',
  visibility: 'stored',
});

const selected = computed(() => memories.value.find((item) => item.id === selectedId.value) || null);

function setListNav() {
  setPageNav(t('nav_memories', 'Memories'), null, null, null);
}

function setEditorNav(title = t('nav_memory', 'Memory')) {
  setPageNav(title, null, null, null);
}

function resetForm() {
  selectedId.value = null;
  mode.value = 'list';
  Object.assign(form, { title: '', description: '', body: '', visibility: 'stored' });
}

function newMemory() {
  selectedId.value = null;
  mode.value = 'new';
  Object.assign(form, { title: '', description: '', body: '', visibility: 'stored' });
  setEditorNav(t('nav_new_memory', 'New memory'));
}

function editMemory(memory) {
  selectedId.value = memory.id;
  mode.value = 'edit';
  Object.assign(form, {
    title: memory.title || '',
    description: memory.description || '',
    body: memory.body || '',
    visibility: memory.visibility || 'stored',
  });
  setEditorNav(memory.title || t('nav_memory', 'Memory'));
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await listMemories();
    memories.value = data.memories || [];
  } catch (err) {
    error.value = err.message || t('common_load_failed', 'Load failed');
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.title.trim() || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      title: form.title,
      description: form.description,
      body: form.body,
      visibility: form.visibility,
    };
    if (selected.value) await updateMemory(selected.value.id, payload);
    else await createMemory(payload);
    await refresh();
    resetForm();
    setListNav();
  } catch (err) {
    error.value = err.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!selected.value) return;
  error.value = '';
  try {
    await deleteMemory(selected.value.id);
    await refresh();
    resetForm();
    setListNav();
  } catch (err) {
    error.value = err.message || 'Delete failed';
  }
}

function visibilityText(value) {
  return {
    must: 'Must',
    star: 'Star',
    stored: 'Stored',
  }[value] || value;
}

onMounted(async () => {
  setListNav();
  await refresh();
});
</script>

<template>
  <section class="tasks-view asset-view">
    <div class="tasks-inner">
      <template v-if="mode === 'list'">
        <div class="asset-head">
          <p class="page-intro">{{ t('page_desc_memories', 'Memories are durable facts and instructions the agent can reuse across conversations.') }}</p>
          <button type="button" @click="newMemory">New</button>
        </div>
        <div v-if="error" class="task-error">{{ error }}</div>
        <div v-if="loading && !memories.length" class="task-empty">Loading memories...</div>
        <div v-else-if="!memories.length" class="task-empty">No memories yet</div>
        <div v-else class="task-list">
          <button
            v-for="memory in memories"
            :key="memory.id"
            class="task-row memory-row"
            :class="{ active: selectedId === memory.id }"
            type="button"
            @click="editMemory(memory)"
          >
            <span class="memory-badge" :class="memory.visibility">{{ visibilityText(memory.visibility) }}</span>
            <span class="task-main">
              <b>{{ memory.title }}</b>
              <small>{{ memory.description || memory.body || 'No description' }}</small>
            </span>
          </button>
        </div>
      </template>

      <form v-else class="asset-editor" @submit.prevent="save">
        <div class="asset-head">
          <h2>{{ selected ? 'Edit memory' : 'New memory' }}</h2>
          <div class="task-head-actions">
            <button type="button" @click="resetForm(); setListNav()">Back</button>
            <button v-if="selected" class="danger-btn" type="button" @click="remove">Delete</button>
          </div>
        </div>
        <label>
          Title
          <input v-model="form.title" placeholder="What should AI remember?" />
        </label>
        <label>
          Visibility
          <select v-model="form.visibility">
            <option value="stored">Stored</option>
            <option value="star">Star</option>
            <option value="must">Must</option>
          </select>
        </label>
        <label>
          Description
          <input v-model="form.description" placeholder="Short summary" />
        </label>
        <label>
          Body
          <textarea v-model="form.body" rows="10" placeholder="Full memory content"></textarea>
        </label>
        <div class="modal-actions">
          <span>{{ selected ? `#${selected.id}` : '' }}</span>
          <button class="text-btn" type="button" @click="resetForm(); setListNav()">Cancel</button>
          <button class="primary-btn" type="submit" :disabled="saving || !form.title.trim()">
            {{ saving ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
