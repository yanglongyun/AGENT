<script setup>
import { computed } from 'vue';
import { renderMd } from '../../lib/renderMd.js';

const props = defineProps({
  content: { type: String, default: '' }
});

const displayContent = computed(() => String(props.content || '').replace(/[\r\n]+$/g, ''));
</script>

<template>
  <div class="m ai">
    <div class="who"><i></i>Agent</div>
    <div class="txt ai-text" v-html="renderMd(displayContent)"></div>
  </div>
</template>

<style scoped>
:deep(p) {
  margin: 0 0 10px;
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
:deep(p:first-child) { margin-top: 0; }
:deep(p:last-child) { margin-bottom: 0; }
:deep(pre) { max-width: 100%; overflow-x: auto; white-space: pre; border-radius: 10px; padding: 10px; margin: 8px 0; background: #fff; border: 1px solid var(--line2); font-size: 12px; }
:deep(code) { max-width: 100%; overflow-wrap: anywhere; font-size: 12px; background: var(--accent-soft); padding: 1px 4px; border-radius: 4px; }
:deep(pre code) { background: none; padding: 0; overflow-wrap: normal; }
:deep(strong) { font-weight: 620; color: var(--ink); }
</style>
