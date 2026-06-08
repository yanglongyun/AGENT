<script setup>
defineProps({
  msg: { type: Object, required: true }
});
</script>

<template>
  <div class="m tool">
    <div class="who"><i></i>Tool call</div>
    <div class="tool-card">
      <div class="tool-head" @click="msg.expanded = !msg.expanded">
        <span class="chev">{{ msg.expanded ? '▼' : '▶' }}</span>
        <span class="tool-title">{{ msg.title }}</span>
        <span v-if="msg.result" class="tool-done">Done</span>
      </div>
      <div v-if="msg.expanded" class="tool-body">
        <div v-if="msg.shell && msg.command" class="tool-command"><span>$ </span>{{ msg.command }}</div>
        <div v-else-if="msg.detail" class="tool-command">{{ msg.detail }}</div>
        <template v-if="msg.result">
          <div class="tool-sep"></div>
          <div class="tool-result">{{ msg.result }}</div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-card {
  overflow: hidden;
  border: 1px solid var(--line2);
  border-radius: 12px;
  background: #fff;
}
.tool-head {
  display: flex;
  cursor: pointer;
  user-select: none;
  align-items: center;
  gap: 8px;
  background: #fffaf7;
  padding: 9px 12px;
}
.chev {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 10px;
}
.tool-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--ink2);
  font-size: 12px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tool-done {
  color: var(--win);
  font-size: 11px;
}
.tool-command,
.tool-result {
  overflow-x: auto;
  white-space: pre;
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.6;
  padding: 10px 12px;
}
.tool-command {
  background: #1f1d1a;
  color: #f7e8e0;
}
.tool-command span {
  color: #b9b4ac;
  user-select: none;
}
.tool-sep {
  height: 1px;
  background: var(--line);
}
.tool-result {
  background: #fff;
  color: var(--ink2);
}
</style>
