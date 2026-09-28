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
  <img
    v-if="src"
    class="inline-flex shrink-0 rounded-full object-cover align-middle"
    :src="src"
    :alt="name"
    :style="style"
  />
  <span
    v-else
    class="inline-flex shrink-0 items-center justify-center rounded-full bg-muted leading-none font-bold text-muted-foreground align-middle"
    :style="style"
    aria-hidden="true"
    >{{ initial }}</span
  >
</template>
