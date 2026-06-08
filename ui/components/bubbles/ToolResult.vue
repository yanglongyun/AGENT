<script setup>
import { computed } from 'vue';

const props = defineProps({
  content: { type: String, default: '' }
});

const displayContent = computed(() => String(props.content || '').replace(/[\r\n]+$/g, ''));
</script>

<template>
  <div class="m tool">
    <div class="who"><i></i>Tool result</div>
    <pre class="standalone-tool-result">{{ displayContent }}</pre>
  </div>
</template>

<style scoped>
.standalone-tool-result {
  overflow-x: auto;
  border: 1px solid var(--line2);
  border-radius: 12px;
  background: #fff;
  color: var(--ink2);
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.6;
  padding: 10px 12px;
  white-space: pre;
}
</style>
