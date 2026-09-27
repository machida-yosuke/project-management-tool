<script setup lang="ts">
import { computed } from 'vue';
import { apiBaseUrl } from '../lib/api';

const props = withDefaults(
  defineProps<{ name: string; avatarUrl: string | null; size?: number }>(),
  { size: 24 },
);

const src = computed(() => (props.avatarUrl ? `${apiBaseUrl}${props.avatarUrl}` : null));
const initial = computed(() => Array.from(props.name.trim())[0]?.toUpperCase() ?? '?');
const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.round(props.size / 2)}px`,
}));
</script>

<template>
  <img v-if="src" class="avatar" :src="src" :alt="name" :style="style" />
  <span v-else class="avatar initial" :style="style" aria-hidden="true">{{ initial }}</span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
  vertical-align: middle;
}

.initial {
  align-items: center;
  justify-content: center;
  background: #cfd8e3;
  color: #334;
  font-weight: bold;
  line-height: 1;
}
</style>
