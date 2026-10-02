<script setup lang="ts">
import type { TaskStatus } from '../../api/generated/models';
import TaskStateIcon from './TaskStateIcon.vue';

defineProps<{ status: TaskStatus }>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium"
    :class="status === 'done' ? 'bg-info/15 text-info' : 'bg-success/15 text-success'"
  >
    <TaskStateIcon :status="status" decorative />
    {{ status === 'done' ? '完了' : '未完了' }}
  </span>
</template>
