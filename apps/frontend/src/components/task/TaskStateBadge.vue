<script setup lang="ts">
import type { TaskStatus } from '../../api/generated/models';
import TaskStateIcon from './TaskStateIcon.vue';

defineProps<{ status: TaskStatus }>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-white"
    :class="status === 'done' ? 'bg-purple-600' : 'bg-green-600'"
  >
    <TaskStateIcon :status="status" decorative />
    {{ status === 'done' ? '完了' : '未完了' }}
  </span>
</template>
