<script setup>
import { computed, inject, onMounted, reactive, ref } from 'vue';
import { createMemory, deleteMemory, listMemories, updateMemory } from '../lib/api.js';

const setPageNav = inject('pageNav');
const memories = ref([]);
const selectedId = ref(null);
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

function resetForm() {
  selectedId.value = null;
  Object.assign(form, { title: '', description: '', body: '', visibility: 'stored' });
}

function editMemory(memory) {
  selectedId.value = memory.id;
  Object.assign(form, {
    title: memory.title || '',
    description: memory.description || '',
    body: memory.body || '',
    visibility: memory.visibility || 'stored',
  });
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await listMemories();
    memories.value = data.memories || [];
  } catch (err) {
    error.value = err.message || 'Load failed';
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
  setPageNav('Memories', null, null, null);
  await refresh();
});
</script>

<template>
  <section class="tasks-view asset-view">
    <div class="asset-inner">
      <div class="asset-panel">
        <div class="asset-head">
          <h2>Memories</h2>
          <button type="button" @click="resetForm">New</button>
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
      </div>

      <form class="asset-editor" @submit.prevent="save">
        <div class="asset-head">
          <h2>{{ selected ? 'Edit memory' : 'New memory' }}</h2>
          <button v-if="selected" class="danger-btn" type="button" @click="remove">Delete</button>
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
          <button class="text-btn" type="button" @click="resetForm">Clear</button>
          <button class="primary-btn" type="submit" :disabled="saving || !form.title.trim()">
            {{ saving ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
