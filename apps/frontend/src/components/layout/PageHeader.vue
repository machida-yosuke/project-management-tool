<script setup lang="ts">
withDefaults(defineProps<{ title: string; description?: string }>(), { description: undefined });
</script>

<template>
  <div class="mb-6">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
        <p v-if="description" class="mt-1 text-sm text-muted-foreground">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.default" class="mt-4">
      <slot />
    </div>
  </div>
</template>
