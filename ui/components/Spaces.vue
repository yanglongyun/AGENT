<script setup>
import { computed, inject, onMounted, reactive, ref } from 'vue';
import { createSpace, createSpaceChat, listSpaceChats, listSpaces, listSpaceTree } from '../lib/api.js';
import { t } from '../lib/locale.js';

const emit = defineEmits(['open-chat']);
const setPageNav = inject('pageNav');

const spaces = ref([]);
const items = ref([]);
const chats = ref([]);
const activeSpaceId = ref('');
const activePath = ref('.');
const loading = ref(false);
const error = ref('');
const form = reactive({ name: '', path: '' });

const activeSpace = computed(() => spaces.value.find((space) => space.id === activeSpaceId.value) || null);
function setNav() {
  setPageNav(t('nav_spaces', 'Spaces'), null, null, null);
}

function parentPath() {
  if (activePath.value === '.') return '.';
  const parts = activePath.value.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? parts.join('/') : '.';
}

async function refreshSpaces() {
  const data = await listSpaces();
  spaces.value = data.spaces || [];
  if (!activeSpaceId.value && spaces.value.length) activeSpaceId.value = spaces.value[0].id;
}

async function refreshCurrent() {
  if (!activeSpaceId.value) {
    items.value = [];
    chats.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const [treeData, chatData] = await Promise.all([
      listSpaceTree({ spaceId: activeSpaceId.value, path: activePath.value }),
      listSpaceChats({ spaceId: activeSpaceId.value, path: activePath.value }),
    ]);
    items.value = treeData.items || [];
    chats.value = chatData.chats || [];
  } catch (err) {
    error.value = err.message || t('common_load_failed', 'Load failed');
  } finally {
    loading.value = false;
  }
}

async function loadAll() {
  loading.value = true;
  error.value = '';
  try {
    await refreshSpaces();
    await refreshCurrent();
  } catch (err) {
    error.value = err.message || t('common_load_failed', 'Load failed');
  } finally {
    loading.value = false;
  }
}

async function addSpace() {
  if (!form.path.trim()) return;
  error.value = '';
  try {
    const data = await createSpace({ name: form.name, path: form.path });
    form.name = '';
    form.path = '';
    await refreshSpaces();
    activeSpaceId.value = data.space?.id || activeSpaceId.value;
    activePath.value = '.';
    await refreshCurrent();
  } catch (err) {
    error.value = err.message || t('spaces_create_failed', 'Create space failed');
  }
}

async function selectSpace(id) {
  activeSpaceId.value = id;
  activePath.value = '.';
  await refreshCurrent();
}

async function openDirectory(item) {
  if (item.kind !== 'directory') return;
  activePath.value = item.relative_path;
  await refreshCurrent();
}

async function goParent() {
  activePath.value = parentPath();
  await refreshCurrent();
}

async function newChat() {
  if (!activeSpaceId.value) return;
  const title = activePath.value === '.' ? activeSpace.value?.name || t('nav_spaces', 'Spaces') : activePath.value;
  try {
    const data = await createSpaceChat({ spaceId: activeSpaceId.value, relativePath: activePath.value, title });
    await refreshCurrent();
    window.dispatchEvent(new CustomEvent('agent:refresh-chats'));
    emit('open-chat', data.chat);
  } catch (err) {
    error.value = err.message || t('spaces_create_chat_failed', 'Create chat failed');
  }
}

function openChat(chat) {
  emit('open-chat', { id: chat.chat_id, title: chat.title });
}

onMounted(async () => {
  setNav();
  await loadAll();
});
</script>

<template>
  <section class="tasks-view asset-view">
    <div class="tasks-inner">
      <p class="page-intro">{{ t('page_desc_spaces', 'Spaces map local project folders so chats can be organized by project and directory.') }}</p>

      <form class="space-form" @submit.prevent="addSpace">
        <input v-model="form.name" :placeholder="t('spaces_name', 'Name')" />
        <input v-model="form.path" class="mono-input" placeholder="/Users/me/project" />
        <button class="primary-btn" type="submit">{{ t('spaces_add', 'Add') }}</button>
      </form>

      <div v-if="error" class="task-error">{{ error }}</div>

      <div v-if="spaces.length" class="space-tabs">
        <button
          v-for="space in spaces"
          :key="space.id"
          type="button"
          :class="{ active: space.id === activeSpaceId }"
          @click="selectSpace(space.id)"
        >
          <b>{{ space.name }}</b>
          <small>{{ space.root_path }}</small>
        </button>
      </div>
      <div v-else-if="!loading" class="task-empty">{{ t('spaces_empty', 'No spaces yet') }}</div>

      <template v-if="activeSpace">
        <div class="asset-head">
          <p class="asset-path">{{ activeSpace.name }} / {{ activePath }}</p>
          <div class="task-head-actions">
            <button v-if="activePath !== '.'" type="button" @click="goParent">{{ t('spaces_back', 'Back') }}</button>
            <button type="button" @click="newChat">{{ t('spaces_new_chat_here', 'New chat here') }}</button>
          </div>
        </div>

        <div class="space-grid">
          <div class="space-panel">
            <h3>{{ t('spaces_folders', 'Folders') }}</h3>
            <div v-if="loading" class="task-empty">{{ t('settings_loading', 'Loading...') }}</div>
            <button
              v-for="item in items.filter((entry) => entry.kind === 'directory')"
              :key="item.relative_path"
              class="task-row"
              type="button"
              @click="openDirectory(item)"
            >
              <span class="skill-icon">D</span>
              <span class="task-main">
                <b>{{ item.name }}</b>
                <small>{{ item.relative_path }}</small>
              </span>
            </button>
            <div v-if="!loading && !items.some((entry) => entry.kind === 'directory')" class="task-empty">{{ t('spaces_no_folders', 'No folders') }}</div>
          </div>

          <div class="space-panel">
            <h3>{{ t('nav_chats', 'Chats') }}</h3>
            <button
              v-for="chat in chats"
              :key="chat.chat_id"
              class="task-row"
              type="button"
              @click="openChat(chat)"
            >
              <span class="skill-icon">C</span>
              <span class="task-main">
                <b>{{ chat.title || 'New chat' }}</b>
                <small>{{ t('spaces_messages_count', '{n} messages', { n: chat.message_count || 0 }) }}</small>
              </span>
            </button>
            <div v-if="!chats.length" class="task-empty">{{ t('spaces_no_chats', 'No chats in this folder') }}</div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
