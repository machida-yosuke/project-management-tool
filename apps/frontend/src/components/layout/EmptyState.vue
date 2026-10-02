<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <div class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
    <p>{{ message }}</p>
    <div v-if="$slots.default" class="mt-4 flex justify-center gap-2">
      <slot />
    </div>
  </div>
</template>
