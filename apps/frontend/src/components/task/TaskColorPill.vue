<script setup lang="ts">
import { computed } from 'vue';
import type { TaskColor } from '@pm-tool/shared';
import { TASK_COLOR_HEX, TASK_COLOR_LABELS } from '../../lib/task-colors';

const props = defineProps<{ color: TaskColor }>();

// Hex alpha suffixes: ~12% fill and ~40% border keep the label readable on every palette color.
const style = computed(() => {
  const hex = TASK_COLOR_HEX[props.color];
  return { backgroundColor: `${hex}1f`, borderColor: `${hex}66` };
});
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
    :style="style"
  >
    <span
      class="size-2 rounded-full"
      :style="{ backgroundColor: TASK_COLOR_HEX[color] }"
      aria-hidden="true"
    />
    {{ TASK_COLOR_LABELS[color] }}
  </span>
</template>
