<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '../../../lib/utils';

// Keeps the registry's single-word file name while satisfying vue/multi-word-component-names.
defineOptions({ name: 'UiCard' });

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div
    data-slot="card"
    :class="
      cn('bg-card text-card-foreground flex flex-col gap-6 rounded-lg border py-6', props.class)
    "
  >
    <slot />
  </div>
</template>
