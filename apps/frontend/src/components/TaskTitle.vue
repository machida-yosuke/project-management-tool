<script setup lang="ts">
import { ref } from 'vue';
import { useUpdateTask } from '../api/generated';
import type { Task } from '../api/generated/models';
import { errorMessage } from '../lib/api';
import { listTasksKeyPrefix, useInvalidate } from '../lib/query';

const props = defineProps<{ task: Task; editable: boolean }>();

const TITLE_ERRORS = { validation_error: 'タイトルは 200 文字以内にしてください' };

const invalidate = useInvalidate();
const editing = ref(false);
const draft = ref('');
const error = ref('');
const submitting = ref(false);

const updateTaskMutation = useUpdateTask({
  mutation: { onSuccess: (_, vars) => invalidate(listTasksKeyPrefix(vars.projectId)) },
});

function startEditing() {
  draft.value = props.task.title;
  error.value = '';
  editing.value = true;
}

function cancel() {
  editing.value = false;
  error.value = '';
}

// preventDefault marks the Escape as handled so an enclosing panel does not also close.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  cancel();
}

async function save() {
  const title = draft.value.trim();
  if (title === '' || submitting.value) return;
  submitting.value = true;
  error.value = '';
  try {
    await updateTaskMutation.mutateAsync({
      projectId: props.task.projectId,
      taskId: props.task.id,
      updateTaskRequest: { title },
    });
    editing.value = false;
  } catch (e) {
    error.value = errorMessage(e, TITLE_ERRORS, '保存に失敗しました');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form v-if="editing" class="task-title" data-testid="task-title-form" @submit.prevent="save">
    <input
      v-model="draft"
      type="text"
      required
      maxlength="200"
      aria-label="タイトル"
      @keydown="onKeydown"
    />
    <button type="submit" :disabled="submitting">保存</button>
    <button type="button" :disabled="submitting" @click="cancel">取消</button>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </form>
  <div v-else class="task-title">
    <h3>{{ task.title }}</h3>
    <button v-if="editable" type="button" @click="startEditing">タイトルを編集</button>
  </div>
</template>

<style scoped>
.task-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.task-title h3 {
  margin: 0;
}

.task-title input {
  flex: 1;
  min-width: 0;
}

.error {
  flex-basis: 100%;
  margin: 0;
  color: #c00;
}
</style>
