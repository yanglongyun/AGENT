<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { listConversations } from '../lib/api.js';

const props = defineProps({
  currentId: { type: [Number, null], default: null },
});

const emit = defineEmits(['select', 'new', 'settings']);

const conversations = ref([]);

async function refresh() {
  try {
    conversations.value = await listConversations();
  } catch {
    conversations.value = [];
  }
}

function onRefreshEvent() { refresh(); }

onMounted(() => {
  refresh();
  window.addEventListener('agents:refresh-conversations', onRefreshEvent);
});

onUnmounted(() => {
  window.removeEventListener('agents:refresh-conversations', onRefreshEvent);
});

defineExpose({ refresh });
</script>

<template>
  <aside class="nav">
    <div class="top">
      <div class="logo">
        <span class="mark"></span>
        <b>agent</b>
      </div>
      <div class="primary-nav">
        <button class="side-primary" type="button" @click="emit('new')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          新对话
        </button>
      </div>
    </div>

    <div class="list">
      <div class="sec"><span class="sec-label">对话</span></div>
      <button
        v-for="c in conversations"
        :key="c.id"
        class="chatitem"
        type="button"
        :class="{ 'bg-[#f1ece3] text-ink': c.id === currentId }"
        @click="emit('select', c)"
      >
        <span class="block overflow-hidden text-ellipsis whitespace-nowrap">{{ c.title }}</span>
        <span v-if="c.description" class="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted">{{ c.description }}</span>
      </button>
      <div v-if="!conversations.length" class="nav-empty">暂无对话,点上面"新对话"</div>
    </div>

    <div class="nav-footer">
      <button class="settings-entry" type="button" @click="emit('settings')">
        <span class="settings-dot"></span>
        <span>
          <b>设置</b>
          <small>模型与系统提示词</small>
        </span>
      </button>
    </div>
  </aside>
</template>
