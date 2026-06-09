<script setup>
import { nextTick, ref } from 'vue';
import { uploadChatFile } from '../lib/api.js';
import { t } from '../lib/locale.js';

defineProps({
  modelValue: { type: String, default: '' },
  busy: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue', 'send', 'abort']);
const textarea = ref(null);
const fileInput = ref(null);
const composing = ref(false);
const pendingFiles = ref([]);
const uploading = ref(false);
const uploadError = ref('');
const MAX_FILES = 10;

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

const openFilePicker = () => {
  uploadError.value = '';
  fileInput.value?.click();
};

const pendingFileKey = (file) => `${file?.path || file?.name || ''}:${file?.size || 0}`;
const localFileKey = (file) => `${file?.name || ''}:${file?.size || 0}:${file?.lastModified || 0}`;
const readNativePath = (file) => file?.path || '';

const appendFiles = async (files = []) => {
  if (!files.length) return;
  uploadError.value = '';
  if (pendingFiles.value.length >= MAX_FILES) {
    uploadError.value = t('chat_upload_limit', '最多只能添加 10 个文件');
    return;
  }
  uploading.value = true;
  const seenLocal = new Set(pendingFiles.value.map(localFileKey));
  const seenPaths = new Set(pendingFiles.value.map(pendingFileKey));
  try {
    for (const f of files) {
      if (pendingFiles.value.length >= MAX_FILES) {
        uploadError.value = t('chat_upload_limit', '最多只能添加 10 个文件');
        break;
      }
      const localKey = localFileKey(f);
      if (seenLocal.has(localKey)) continue;
      seenLocal.add(localKey);
      const nativePath = readNativePath(f);
      const item = nativePath
        ? { type: 'file', name: f.name || nativePath, path: nativePath, size: f.size || 0, lastModified: f.lastModified || 0 }
        : await uploadChatFile(f);
      const pathKey = pendingFileKey(item);
      if (item?.path && !seenPaths.has(pathKey)) {
        seenPaths.add(pathKey);
        pendingFiles.value.push({ ...item, lastModified: f.lastModified || 0 });
      }
    }
  } catch (err) {
    uploadError.value = err.message || t('chat_upload_failed', '本地缓存失败');
  } finally {
    uploading.value = false;
  }
};

const onPickFiles = async (e) => {
  await appendFiles(Array.from(e.target?.files || []));
  if (fileInput.value) fileInput.value.value = '';
};

const clearFiles = () => { pendingFiles.value = []; };

const formatSize = (size) => {
  const n = Number(size || 0);
  if (!n) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
};

defineExpose({ pendingFiles, clearFiles, resetTextarea, appendFiles });
</script>

<template>
  <div class="composer">
    <input ref="fileInput" type="file" class="hidden" multiple @change="onPickFiles" />

    <div v-if="pendingFiles.length" class="mx-auto mb-2 flex max-w-[620px] gap-2 overflow-x-auto px-0.5 pb-1 pt-0.5">
      <div
        v-for="(f, idx) in pendingFiles"
        :key="pendingFileKey(f)"
        class="relative flex h-[52px] w-[168px] shrink-0 items-center gap-2.5 rounded-xl border border-line2 bg-white px-2.5"
      >
        <div class="h-8 w-[27px] shrink-0 rounded-[5px] border border-line2 bg-gradient-to-b from-[#fff8ef] to-[#f0dfd3]"></div>
        <div class="min-w-0 flex-1">
          <div class="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold leading-tight text-ink">{{ f.name }}</div>
          <div class="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9.5px] text-muted" :title="f.path">{{ f.path || formatSize(f.size) || f.type || t('server_attachment_file', 'file') }}</div>
        </div>
        <button
          type="button"
          class="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-xs font-bold text-white"
          @click="pendingFiles.splice(idx,1)"
        >×</button>
      </div>
    </div>
    <div v-if="uploadError" class="mx-auto mb-1.5 max-w-[620px] text-[11px] text-[#b34b33]">{{ uploadError }}</div>

    <div class="inputwrap">
      <button
        type="button"
        :disabled="busy || uploading"
        @click="openFilePicker"
        class="attachbtn"
      >{{ uploading ? '⏳' : '📎' }}</button>
      <textarea
        ref="textarea"
        :value="modelValue"
        @input="setInput($event.target.value); autoResize()"
        @keydown.enter.exact="onEnter"
        @compositionstart="composing = true"
        @compositionend="composing = false"
        :placeholder="busy ? t('chat_placeholder_busy', '进行中...') : t('chat_placeholder_input', '输入消息...')"
        rows="1"
        :disabled="busy"
      />
      <button
        v-if="busy"
        type="button"
        @click="emit('abort')"
        class="sendbtn"
      >■</button>
      <button
        v-else
        type="button"
        :disabled="!modelValue.trim() && !pendingFiles.length"
        @click="emit('send')"
        class="sendbtn"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
      </button>
    </div>
    <div class="hint">Agent Chat can stream replies and use shell when local work is needed.</div>
  </div>
</template>
