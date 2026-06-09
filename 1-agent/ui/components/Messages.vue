<script setup>
import { nextTick, ref } from 'vue';
import BubbleAi from './bubbles/Ai.vue';
import BubbleUser from './bubbles/User.vue';
import ToolCall from './bubbles/ToolCall.vue';

defineProps({
  messages: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false }
});

const msgBox = ref(null);

const scrollToBottom = (smooth = true) => nextTick(() => {
  const el = msgBox.value;
  if (!el) return;
  if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  else el.scrollTop = el.scrollHeight;
});

defineExpose({ msgBox, scrollToBottom });
</script>

<template>
  <div ref="msgBox" class="stream">
    <div class="thread">
      <div v-if="!messages.length && !busy" class="empty">
        <div class="mark"></div>
        <div class="big">agent</div>
        <div class="sub">一个对话窗口 + shell 工具调用循环。</div>
      </div>

      <template v-else>
        <template v-for="(m, i) in messages" :key="m._key || i">
          <BubbleUser v-if="m.role === 'user'" :content="m.content" />
          <BubbleAi v-else-if="m.role === 'assistant'" :content="m.content" />
          <ToolCall v-else-if="m.type === 'tool_call'" :msg="m" />
        </template>

        <div v-if="busy" class="m ai">
          <div class="who"><i></i>Agent</div>
          <div class="flex gap-[5px] py-[3px]">
            <i class="h-[7px] w-[7px] animate-[blink_1.2s_infinite] rounded-full bg-accent opacity-50"></i>
            <i class="h-[7px] w-[7px] animate-[blink_1.2s_infinite] rounded-full bg-accent opacity-50 [animation-delay:0.2s]"></i>
            <i class="h-[7px] w-[7px] animate-[blink_1.2s_infinite] rounded-full bg-accent opacity-50 [animation-delay:0.4s]"></i>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
@keyframes blink {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}
</style>
