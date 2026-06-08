<script setup>
import { inject, onMounted, ref } from 'vue';
import { getSkill, listSkills } from '../lib/api.js';
import { t } from '../lib/locale.js';

const setPageNav = inject('pageNav');
const skills = ref([]);
const current = ref(null);
const loading = ref(false);
const error = ref('');

function setListNav() {
  setPageNav(t('nav_skills', 'Skills'), null, null, null);
}

function closeSkill() {
  current.value = null;
  setListNav();
}

function setDetailNav(skill) {
  setPageNav(skill?.name || t('nav_skill', 'Skill'), null, null, null);
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await listSkills();
    skills.value = data.skills || [];
  } catch (err) {
    error.value = err.message || t('common_load_failed', 'Load failed');
  } finally {
    loading.value = false;
  }
}

async function openSkill(skill) {
  error.value = '';
  try {
    const data = await getSkill(skill.id);
    current.value = data.skill || null;
    setDetailNav(current.value || skill);
  } catch (err) {
    error.value = err.message || t('common_load_failed', 'Load failed');
  }
}

onMounted(async () => {
  setListNav();
  await refresh();
});
</script>

<template>
  <section class="tasks-view asset-view">
    <div class="tasks-inner">
      <template v-if="!current">
        <p class="page-intro">{{ t('page_desc_skills', 'Skills are local instruction packs that teach the agent how to handle specific workflows.') }}</p>
        <div v-if="error" class="task-error">{{ error }}</div>
        <div v-if="loading && !skills.length" class="task-empty">Loading skills...</div>
        <div v-else-if="!skills.length" class="task-empty">No local skills found</div>
        <div v-else class="task-list">
          <button
            v-for="skill in skills"
            :key="skill.id"
            class="task-row"
            :class="{ active: current?.id === skill.id }"
            type="button"
            @click="openSkill(skill)"
          >
            <span class="skill-icon">S</span>
            <span class="task-main">
              <b>{{ skill.name }}</b>
              <small>{{ skill.description || skill.path }}</small>
            </span>
          </button>
        </div>
      </template>

      <article v-else class="asset-editor skill-reader">
        <div class="asset-head">
          <button type="button" @click="closeSkill">Back</button>
        </div>
        <p v-if="current.path" class="asset-path">{{ current.path }}</p>
        <pre>{{ current.content }}</pre>
      </article>
    </div>
  </section>
</template>
