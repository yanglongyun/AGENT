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

    <div v-if="pendingFiles.length" class="attachments-row">
      <div
        v-for="(f, idx) in pendingFiles"
        :key="pendingFileKey(f)"
        class="attachment-pill"
      >
        <div class="file-icon"></div>
        <div class="min-w-0 flex-1">
          <div class="file-name">{{ f.name }}</div>
          <div class="file-meta" :title="f.path">{{ f.path || formatSize(f.size) || f.type || t('server_attachment_file', 'file') }}</div>
        </div>
        <button
          type="button"
          class="file-remove"
          @click="pendingFiles.splice(idx,1)"
        >×</button>
      </div>
    </div>
    <div v-if="uploadError" class="upload-error">{{ uploadError }}</div>

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

<style scoped>
.attachments-row {
  display: flex;
  max-width: 620px;
  gap: 8px;
  margin: 0 auto 8px;
  overflow-x: auto;
  padding: 2px 2px 4px;
}
.attachment-pill {
  position: relative;
  display: flex;
  width: 168px;
  height: 52px;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--line2);
  border-radius: 12px;
  background: #fff;
  padding: 0 10px;
}
.file-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
  border: 1px solid var(--line2);
  border-radius: 5px;
  background: linear-gradient(180deg, #fff8ef, #f0dfd3);
}
.file-name {
  overflow: hidden;
  color: var(--ink);
  font-size: 12px;
  font-weight: 620;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-meta {
  margin-top: 2px;
  overflow: hidden;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 50%;
  background: var(--ink);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.upload-error {
  max-width: 620px;
  margin: 0 auto 6px;
  color: #b34b33;
  font-size: 11px;
}
</style>
