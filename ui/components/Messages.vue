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
  nextTick(() => {
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
        <button v-if="hasMore" class="load-more" type="button">{{ t('chat_load_more', 'Load more...') }}</button>

        <template v-for="(m, i) in messages" :key="m._key || i">
          <BubbleUser v-if="m.role === 'user'" :content="m.content" :attachments="m.attachments" />
          <BubbleSubscription v-else-if="m.role === 'subscription'" :content="m.content" />
          <BubbleAi v-else-if="m.role === 'assistant'" :content="m.content" />
          <ToolCall v-else-if="m.type === 'tool_call'" :msg="m" />
          <ToolResult v-else-if="m.type === 'tool_result'" :content="m.content" />
        </template>

        <div v-if="busy" class="m ai">
          <div class="who"><i></i>Agent Chat</div>
          <div class="thinking"><i></i><i></i><i></i></div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.load-more {
  display: block;
  margin: 10px auto 0;
  color: var(--muted);
  font-size: 11.5px;
}
.thinking {
  display: flex;
  gap: 5px;
  padding: 3px 0;
}
.thinking i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.5;
  animation: blink 1.2s infinite;
}
.thinking i:nth-child(2) {
  animation-delay: 0.2s;
}
.thinking i:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes blink {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}
</style>
