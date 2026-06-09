<script setup>
import { onMounted, ref } from 'vue';

const emit = defineEmits(['close']);

const form = ref({ apiUrl: '', apiKey: '', model: '', system: '' });
const saving = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    form.value = {
      apiUrl: data.apiUrl || '',
      apiKey: data.apiKey || '',
      model: data.model || '',
      // 回显当前生效的提示词:有自定义用自定义,否则填入内置默认,方便查看与修改。
      system: data.system || data.systemDefault || '',
    };
  } catch {}
});

async function save() {
  error.value = '';
  saving.value = true;
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    });
    if (!res.ok) throw new Error('保存失败');
    emit('close');
  } catch (e) {
    error.value = e.message || '保存失败';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" @click.self="emit('close')">
    <div class="w-full max-w-[480px] rounded-2xl border border-line2 bg-panel p-5 shadow-xl">
      <div class="mb-4 flex items-center">
        <div class="text-sm font-semibold text-ink">设置</div>
        <button class="ml-auto text-muted hover:text-ink" @click="emit('close')">✕</button>
      </div>

      <div class="space-y-3.5">
        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-muted">接口地址</span>
          <input v-model="form.apiUrl" type="text" placeholder="https://api.deepseek.com/chat/completions"
            class="w-full rounded-lg border border-line2 bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" />
        </label>
        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-muted">API Key</span>
          <input v-model="form.apiKey" type="password" placeholder="sk-..."
            class="w-full rounded-lg border border-line2 bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" />
        </label>
        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-muted">模型</span>
          <input v-model="form.model" type="text" placeholder="deepseek-v4-pro"
            class="w-full rounded-lg border border-line2 bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" />
        </label>
        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-muted">系统提示词</span>
          <textarea v-model="form.system" rows="6" placeholder="系统提示词"
            class="w-full resize-y rounded-lg border border-line2 bg-white px-3 py-2 text-[13px] leading-relaxed text-ink outline-none focus:border-accent"></textarea>
        </label>
      </div>

      <div v-if="error" class="mt-3 text-[12px] text-[#b34b33]">{{ error }}</div>

      <div class="mt-5 flex justify-end gap-2">
        <button class="rounded-lg px-3.5 py-2 text-[13px] text-muted hover:text-ink" @click="emit('close')">取消</button>
        <button :disabled="saving"
          class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          @click="save">{{ saving ? '保存中...' : '保存' }}</button>
      </div>
    </div>
  </div>
</template>
