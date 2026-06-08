<script setup>
import { inject, onMounted, ref } from 'vue';
import { getSkill, listSkills } from '../lib/api.js';

const setPageNav = inject('pageNav');
const skills = ref([]);
const current = ref(null);
const loading = ref(false);
const error = ref('');

function setListNav() {
  setPageNav('Skills', null, null, null);
}

function setDetailNav(skill) {
  setPageNav(skill?.name || 'Skill', () => {
    current.value = null;
    setListNav();
  }, null, null);
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await listSkills();
    skills.value = data.skills || [];
  } catch (err) {
    error.value = err.message || 'Load failed';
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
    error.value = err.message || 'Load failed';
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
        <div class="asset-head">
          <h2>Skills</h2>
        </div>
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
          <h2>{{ current.name }}</h2>
        </div>
        <p v-if="current.path" class="asset-path">{{ current.path }}</p>
        <pre>{{ current.content }}</pre>
      </article>
    </div>
  </section>
</template>
