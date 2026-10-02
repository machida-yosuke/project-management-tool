<script setup lang="ts">
import { ref } from 'vue';
import { useUpdateTask } from '../api/generated';
import type { Task } from '../api/generated/models';
import { errorMessage } from '../lib/api';
import { listTasksKeyPrefix, useInvalidate } from '../lib/query';
import { Button } from './ui/button';
import { Input } from './ui/input';

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
  <form
    v-if="editing"
    class="flex flex-wrap items-center gap-2"
    data-testid="task-title-form"
    @submit.prevent="save"
  >
    <Input
      v-model="draft"
      type="text"
      required
      maxlength="200"
      aria-label="タイトル"
      class="min-w-0 flex-1"
      @keydown="onKeydown"
    />
    <Button type="submit" :disabled="submitting">保存</Button>
    <Button type="button" variant="outline" :disabled="submitting" @click="cancel">
      キャンセル
    </Button>
    <p v-if="error" class="basis-full text-destructive" role="alert">{{ error }}</p>
  </form>
  <div v-else class="flex items-start justify-between gap-3">
    <h2 class="min-w-0 text-3xl font-semibold tracking-tight wrap-anywhere">{{ task.title }}</h2>
    <Button
      v-if="editable"
      type="button"
      variant="outline"
      size="sm"
      class="mt-1 flex-none"
      @click="startEditing"
    >
      タイトルを編集
    </Button>
  </div>
</template>
