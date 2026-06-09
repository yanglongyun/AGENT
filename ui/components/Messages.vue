<script setup>
import { nextTick, ref } from 'vue';
import BubbleAi from './bubbles/Ai.vue';
import BubbleSubscription from './bubbles/Subscription.vue';
import BubbleUser from './bubbles/User.vue';
import ToolCall from './bubbles/ToolCall.vue';
import ToolResult from './bubbles/ToolResult.vue';
import { t } from '../lib/locale.js';

defineProps({
  messages: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  hasMore: { type: Boolean, default: false },
  emptyHints: { type: Array, default: () => [] }
});

const emit = defineEmits(['pick-hint', 'top-reached']);
const msgBox = ref(null);

const scrollToBottom = (smooth = true) => {
  return nextTick(() => {
    const el = msgBox.value;
    if (!el) return;
    if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else el.scrollTop = el.scrollHeight;
  });
};

const onScroll = () => {
  const el = msgBox.value;
  if (el && el.scrollTop < 50) emit('top-reached', el.scrollHeight);
};

defineExpose({ msgBox, scrollToBottom });
</script>

<template>
  <div ref="msgBox" class="stream" @scroll="onScroll">
    <div class="thread">
      <div v-if="!messages.length && !busy" class="empty">
        <div class="mark"></div>
        <div class="big">Agent Chat</div>
        <div class="sub">{{ t('chat_tagline', 'Ask anything, stream replies, run shell tools when needed.') }}</div>
        <div class="suggest">
          <button
          v-for="hint in emptyHints"
          :key="hint.label"
          class="chip"
          @click="emit('pick-hint', hint.text)"
        >
            {{ hint.icon }} {{ hint.label }}
          </button>
        </div>
      </div>

      <template v-else>
        <button v-if="hasMore" class="mx-auto mt-2.5 block text-[11.5px] text-muted" type="button">{{ t('chat_load_more', 'Load more...') }}</button>

        <template v-for="(m, i) in messages" :key="m._key || i">
          <BubbleUser v-if="m.role === 'user'" :content="m.content" :attachments="m.attachments" />
          <BubbleSubscription v-else-if="m.role === 'subscription'" :content="m.content" />
          <BubbleAi v-else-if="m.role === 'assistant'" :content="m.content" />
          <ToolCall v-else-if="m.type === 'tool_call'" :msg="m" />
          <ToolResult v-else-if="m.type === 'tool_result'" :content="m.content" />
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
