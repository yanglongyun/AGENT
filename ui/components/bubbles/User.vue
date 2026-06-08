<script setup>
import { computed } from 'vue';

const props = defineProps({
  content: { type: String, default: '' },
  attachments: { type: Array, default: () => [] }
});

const displayContent = computed(() => String(props.content || '').replace(/[\r\n]+$/g, ''));

const formatSize = (size) => {
  const n = Number(size || 0);
  if (!n) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
};
</script>

<template>
  <div class="m me">
    <div class="who"><i></i>You</div>
    <div class="txt">
      <div v-if="attachments?.length" class="mb-2.5 flex flex-wrap gap-[7px]">
        <div
          v-for="(f, fi) in attachments"
          :key="fi"
          class="flex max-w-[220px] items-center gap-[7px] rounded-[10px] border border-[var(--line2)] bg-white px-2 py-[5px] text-[var(--ink2)]"
        >
          <span class="h-[15px] w-[13px] rounded-sm border border-[var(--line2)] bg-gradient-to-b from-[#fff8ef] to-[#f0dfd3]"></span>
          <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold">{{ f.name }}</span>
          <span v-if="formatSize(f.size)" class="shrink-0 font-mono text-[9px] text-[var(--muted)]">{{ formatSize(f.size) }}</span>
        </div>
      </div>
      <p v-if="displayContent">{{ displayContent }}</p>
    </div>
  </div>
</template>
