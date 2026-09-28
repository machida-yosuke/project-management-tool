<script setup lang="ts">
import { ref } from 'vue';
import { isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import { useUpdateTask } from '../api/generated';
import type { Task } from '../api/generated/models';
import { draftKeys } from '../lib/drafts';
import { listTasksKeyPrefix, useInvalidate } from '../lib/query';
import RichTextContent from './rich-text/RichTextContent.vue';
import RichTextForm from './rich-text/RichTextForm.vue';

const props = defineProps<{ task: Task; editable: boolean }>();

const DESCRIPTION_ERRORS = { validation_error: '本文が大きすぎるか、形式が正しくありません' };

const invalidate = useInvalidate();
const editing = ref(false);

const updateTaskMutation = useUpdateTask({
  mutation: { onSuccess: (_, vars) => invalidate(listTasksKeyPrefix(vars.projectId)) },
});

function saveDescription(description: RichTextDoc) {
  return updateTaskMutation.mutateAsync({
    projectId: props.task.projectId,
    taskId: props.task.id,
    updateTaskRequest: { description },
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP');
}
</script>

<template>
  <div class="task-description">
    <RichTextForm
      v-if="editing"
      :project-id="task.projectId"
      :draft-key="draftKeys.description(task.id)"
      :initial-doc="task.description"
      label="本文"
      placeholder="本文を書く"
      submit-label="保存"
      cancelable
      :error-messages="DESCRIPTION_ERRORS"
      :submit="saveDescription"
      @submitted="editing = false"
      @cancel="editing = false"
    />
    <template v-else>
      <RichTextContent
        v-if="!isRichTextDocEmpty(task.description)"
        data-testid="description"
        :doc="task.description"
      />
      <div class="meta">
        <span
          v-if="task.descriptionEditedAt"
          class="muted"
          data-testid="description-edited"
          :title="formatDate(task.descriptionEditedAt)"
        >
          更新履歴あり
        </span>
        <button v-if="editable" type="button" @click="editing = true">本文を編集</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.task-description {
  margin: 8px 0 12px;
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 0.85em;
}

.muted {
  color: #666;
}
</style>
