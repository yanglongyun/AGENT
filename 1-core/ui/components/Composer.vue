<script setup>
import { nextTick, ref } from 'vue';

defineProps({
  modelValue: { type: String, default: '' },
  busy: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue', 'send', 'abort']);
const textarea = ref(null);
const composing = ref(false);

const setInput = (value) => emit('update:modelValue', value);

const autoResize = () => {
  const el = textarea.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
};

const resetTextarea = () => nextTick(() => {
  if (textarea.value) textarea.value.style.height = 'auto';
});

const onEnter = (e) => {
  if (composing.value || e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  emit('send');
};

defineExpose({ resetTextarea });
</script>

<template>
  <div class="composer">
    <div class="inputwrap">
      <textarea
        ref="textarea"
        :value="modelValue"
        @input="setInput($event.target.value); autoResize()"
        @keydown.enter.exact="onEnter"
        @compositionstart="composing = true"
        @compositionend="composing = false"
        :placeholder="busy ? '进行中...' : '输入消息...'"
        rows="1"
        :disabled="busy"
      />
      <button v-if="busy" type="button" @click="emit('abort')" class="sendbtn">■</button>
      <button
        v-else
        type="button"
        :disabled="!modelValue.trim()"
        @click="emit('send')"
        class="sendbtn"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
      </button>
    </div>
  </div>
</template>
