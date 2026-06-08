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
      <div v-if="attachments?.length" class="attachment-list">
        <div
          v-for="(f, fi) in attachments"
          :key="fi"
          class="user-file"
        >
          <span class="file-dot"></span>
          <span class="file-label">{{ f.name }}</span>
          <span v-if="formatSize(f.size)" class="file-size">{{ formatSize(f.size) }}</span>
        </div>
      </div>
      <p v-if="displayContent">{{ displayContent }}</p>
    </div>
  </div>
</template>

<style scoped>
.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 10px;
}
.user-file {
  display: flex;
  max-width: 220px;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--line2);
  border-radius: 10px;
  background: #fff;
  color: var(--ink2);
  padding: 5px 8px;
}
.file-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-size {
  flex-shrink: 0;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 9px;
}
.file-dot {
  width: 13px;
  height: 15px;
  border-radius: 2px;
  border: 1px solid var(--line2);
  background: linear-gradient(180deg, #fff8ef, #f0dfd3);
}
</style>
