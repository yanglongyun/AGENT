<script setup>
import { computed, defineAsyncComponent, inject, watch } from 'vue';
import { apps, getApp } from '../apps/registry.js';
import { t } from '../lib/locale.js';

const props = defineProps({
  appId: { type: String, default: '' },
});
defineEmits(['open-app']);

const setPageNav = inject('pageNav');
const activeApp = computed(() => getApp(props.appId));
const activeComponent = computed(() => activeApp.value ? defineAsyncComponent(activeApp.value.load) : null);

watch(activeApp, () => {
  setPageNav(activeApp.value?.name || t('nav_app', 'Apps'), null, null, null);
}, { immediate: true });
</script>

<template>
  <section class="apps-view">
    <component :is="activeComponent" v-if="activeComponent" />
    <div v-else class="tasks-view">
      <div class="tasks-inner">
        <div class="apps-grid">
          <button
            v-for="app in apps"
            :key="app.id"
            class="app-card"
            type="button"
            @click="$emit('open-app', app.id)"
          >
            <span>{{ app.icon }}</span>
            <b>{{ app.name }}</b>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
