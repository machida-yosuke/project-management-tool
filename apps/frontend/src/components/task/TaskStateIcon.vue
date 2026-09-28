<script setup lang="ts">
import { computed } from 'vue';
import { CircleCheck, CircleDot } from '@lucide/vue';
import type { TaskStatus } from '../../api/generated/models';

// `decorative` is for use inside a labelled element: the icon inherits its color and is hidden from AT.
const props = withDefaults(defineProps<{ status: TaskStatus; decorative?: boolean }>(), {
  decorative: false,
});

const done = computed(() => props.status === 'done');
const a11y = computed(() =>
  props.decorative
    ? { 'aria-hidden': 'true' as const }
    : { role: 'img', 'aria-label': done.value ? '完了' : '未完了' },
);
const colorClass = computed(() => {
  if (props.decorative) return '';
  return done.value ? 'text-purple-600' : 'text-green-600';
});
</script>

<template>
  <component
    :is="done ? CircleCheck : CircleDot"
    class="size-4 flex-none"
    :class="colorClass"
    v-bind="a11y"
  />
</template>
