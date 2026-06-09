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
    <pre class="overflow-x-auto whitespace-pre rounded-xl border border-line2 bg-white px-3 py-2.5 font-mono text-[11px] leading-[1.6] text-ink2">{{ displayContent }}</pre>
  </div>
</template>
