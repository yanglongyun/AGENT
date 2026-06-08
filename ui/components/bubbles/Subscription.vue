<script setup>
import { computed } from 'vue';

const props = defineProps({
  content: { type: String, default: '' }
});

const displayContent = computed(() => String(props.content || '').replace(/[\r\n]+$/g, ''));
</script>

<template>
  <div class="m ai">
    <div class="who"><i></i>Subscription</div>
    <div class="txt">
      <p>{{ displayContent }}</p>
    </div>
  </div>
</template>
