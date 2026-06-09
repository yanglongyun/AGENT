<script setup>
import { ref } from 'vue';
import { createConversation } from '../lib/api.js';

const emit = defineEmits(['close', 'created']);

const form = ref({ title: '', description: '', system: '' });
const saving = ref(false);
const error = ref('');

async function submit() {
  error.value = '';
  if (!form.value.title.trim()) {
    error.value = '请填写标题';
    return;
  }
  saving.value = true;
  try {
    const conversation = await createConversation(form.value);
    emit('created', conversation);
  } catch (e) {
    error.value = e.message || '创建失败';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" @click.self="emit('close')">
    <div class="w-full max-w-[480px] rounded-2xl border border-line2 bg-panel p-5 shadow-xl">
      <div class="mb-4 flex items-center">
        <div class="text-sm font-semibold text-ink">新对话</div>
        <button class="ml-auto text-muted hover:text-ink" @click="emit('close')">✕</button>
      </div>

      <div class="space-y-3.5">
        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-muted">标题</span>
          <input v-model="form.title" type="text" placeholder="小红 / 研究员 / shell 操作员..."
            class="w-full rounded-lg border border-line2 bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" />
        </label>
        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-muted">描述</span>
          <input v-model="form.description" type="text" placeholder="一句话说这个对话的定位,会出现在其他对话的'同事列表'里"
            class="w-full rounded-lg border border-line2 bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" />
        </label>
        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-muted">系统提示词</span>
          <textarea v-model="form.system" rows="6" placeholder="给这个对话设定的角色与行为(可留空)"
            class="w-full resize-y rounded-lg border border-line2 bg-white px-3 py-2 text-[13px] leading-relaxed text-ink outline-none focus:border-accent"></textarea>
        </label>
      </div>

      <div v-if="error" class="mt-3 text-[12px] text-[#b34b33]">{{ error }}</div>

      <div class="mt-5 flex justify-end gap-2">
        <button class="rounded-lg px-3.5 py-2 text-[13px] text-muted hover:text-ink" @click="emit('close')">取消</button>
        <button :disabled="saving"
          class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          @click="submit">{{ saving ? '创建中...' : '创建' }}</button>
      </div>
    </div>
  </div>
</template>
