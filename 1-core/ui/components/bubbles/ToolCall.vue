<script setup>
defineProps({
  msg: { type: Object, required: true }
});
</script>

<template>
  <div class="m tool">
    <div class="who"><i></i>Tool call</div>
    <div class="overflow-hidden rounded-xl border border-line2 bg-white">
      <div class="flex cursor-pointer select-none items-center gap-2 bg-[#fffaf7] px-3 py-[9px]" @click="msg.expanded = !msg.expanded">
        <span class="shrink-0 text-[10px] text-muted">{{ msg.expanded ? '▼' : '▶' }}</span>
        <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-ink2">{{ msg.title }}</span>
        <span v-if="msg.result" class="text-[11px] text-win">Done</span>
      </div>
      <div v-if="msg.expanded" class="tool-body">
        <div v-if="msg.shell && msg.command" class="overflow-x-auto whitespace-pre bg-[#1f1d1a] px-3 py-2.5 font-mono text-[11px] leading-[1.6] text-[#f7e8e0]"><span class="select-none text-[#b9b4ac]">$ </span>{{ msg.command }}</div>
        <div v-else-if="msg.detail" class="overflow-x-auto whitespace-pre bg-[#1f1d1a] px-3 py-2.5 font-mono text-[11px] leading-[1.6] text-[#f7e8e0]">{{ msg.detail }}</div>
        <template v-if="msg.result">
          <div class="h-px bg-line"></div>
          <div class="overflow-x-auto whitespace-pre bg-white px-3 py-2.5 font-mono text-[11px] leading-[1.6] text-ink2">{{ msg.result }}</div>
        </template>
      </div>
    </div>
  </div>
</template>
