<script setup lang="ts">
import { useUpdateTask } from '../api/generated';
import type { Task } from '../api/generated/models';
import { listTasksKeyPrefix, useInvalidate } from '../lib/query';
import EditableTitle from './EditableTitle.vue';

const props = defineProps<{ task: Task; editable: boolean }>();

const TITLE_ERRORS = { validation_error: 'タイトルは 200 文字以内にしてください' };

const invalidate = useInvalidate();

const updateTaskMutation = useUpdateTask({
  mutation: { onSuccess: (_, vars) => invalidate(listTasksKeyPrefix(vars.projectId)) },
});

function saveTitle(title: string) {
  return updateTaskMutation.mutateAsync({
    projectId: props.task.projectId,
    taskId: props.task.id,
    updateTaskRequest: { title },
  });
}
</script>

<template>
  <EditableTitle
    data-testid="task-title-form"
    :title="task.title"
    :editable="editable"
    :save="saveTitle"
    :error-messages="TITLE_ERRORS"
  />
</template>
