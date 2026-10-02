<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <section class="border-b py-3 last:border-b-0">
    <div class="mb-1 flex items-center justify-between gap-2">
      <h2 class="text-xs font-semibold text-muted-foreground">{{ title }}</h2>
      <slot name="action" />
    </div>
    <slot />
  </section>
</template>
