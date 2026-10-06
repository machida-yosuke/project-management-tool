<script setup lang="ts">
import { ref } from 'vue';
import { isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import { useUpdateTask } from '../api/generated';
import type { Task } from '../api/generated/models';
import { draftKeys } from '../lib/drafts';
import { listTasksKeyPrefix, useInvalidate } from '../lib/query';
import RichTextContent from './rich-text/RichTextContent.vue';
import RichTextForm from './rich-text/RichTextForm.vue';
import TimelineItem from './task/TimelineItem.vue';
import { Button } from './ui/button';

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
  <TimelineItem class="task-description" :author="task.createdBy" :created-at="task.createdAt">
    <template #meta>
      <span
        v-if="task.descriptionEditedAt"
        class="text-muted-foreground"
        data-testid="description-edited"
        :title="formatDate(task.descriptionEditedAt)"
      >
        編集済み
      </span>
    </template>
    <template #actions>
      <Button
        v-if="editable && !editing"
        type="button"
        variant="ghost"
        size="sm"
        @click="editing = true"
      >
        編集
      </Button>
    </template>
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
    <RichTextContent
      v-else-if="!isRichTextDocEmpty(task.description)"
      data-testid="description"
      :doc="task.description"
    />
    <p v-else class="text-sm text-muted-foreground italic">本文はありません</p>
  </TimelineItem>
</template>
