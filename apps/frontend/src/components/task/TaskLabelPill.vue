<script setup lang="ts">
import { computed } from 'vue';
import type { TaskLabel } from '../../api/generated/models';

const props = defineProps<{ label: Pick<TaskLabel, 'name' | 'color'> }>();

// Hex alpha suffixes: ~12% fill and ~40% border keep the label readable on every palette color.
const style = computed(() => {
  const hex = props.label.color;
  return { backgroundColor: `${hex}1f`, borderColor: `${hex}66` };
});
</script>

<template>
  <span
    class="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
    :style="style"
  >
    <span
      class="size-2 flex-none rounded-full"
      :style="{ backgroundColor: label.color }"
      aria-hidden="true"
    />
    <span class="truncate">{{ label.name }}</span>
  </span>
</template>
