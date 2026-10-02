<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_LABEL_COLOR, LABEL_COLOR_PRESETS } from '@pm-tool/shared';
import { apiBaseUrl } from '../lib/api';

const props = withDefaults(
  defineProps<{ name: string; avatarUrl: string | null; userId?: string; size?: number }>(),
  { size: 24, userId: undefined },
);

const src = computed(() => (props.avatarUrl ? `${apiBaseUrl}${props.avatarUrl}` : null));
const initial = computed(() => Array.from(props.name.trim())[0]?.toUpperCase() ?? '?');
const sizeStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.round(props.size / 2)}px`,
}));

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

// Hashing the id keeps a user's color stable across renames; the name is only a fallback.
const fallbackStyle = computed(() => {
  const index = hashString(props.userId ?? props.name) % LABEL_COLOR_PRESETS.length;
  const color = LABEL_COLOR_PRESETS[index] ?? DEFAULT_LABEL_COLOR;
  return { ...sizeStyle.value, backgroundColor: `${color}26`, color };
});
</script>

<template>
  <img
    v-if="src"
    class="inline-flex shrink-0 rounded-full object-cover align-middle"
    :src="src"
    :alt="name"
    :style="sizeStyle"
  />
  <span
    v-else
    class="inline-flex shrink-0 items-center justify-center rounded-full leading-none font-bold align-middle"
    :style="fallbackStyle"
    aria-hidden="true"
    >{{ initial }}</span
  >
</template>
