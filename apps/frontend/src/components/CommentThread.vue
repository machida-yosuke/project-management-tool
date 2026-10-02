<script setup lang="ts">
import { ref } from 'vue';
import { emptyRichTextDoc, isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import { getListCommentsQueryKey, useCreateComment, useUpdateComment } from '../api/generated';
import type { TaskComment } from '../api/generated/models';
import { draftKeys } from '../lib/drafts';
import { listProjectCommentsKeyPrefix, useInvalidate } from '../lib/query';
import RichTextContent from './rich-text/RichTextContent.vue';
import RichTextForm from './rich-text/RichTextForm.vue';
import TimelineItem from './task/TimelineItem.vue';
import { Button } from './ui/button';

const props = defineProps<{
  projectId: string;
  taskId: string;
  comments: TaskComment[];
  commentsError: string;
  editable: boolean;
  currentUserId: string | null;
}>();

const COMMENT_ERRORS = {
  validation_error: 'コメントが空か、大きすぎます',
  forbidden: 'このコメントは編集できません',
};

const invalidate = useInvalidate();
const editingCommentId = ref<string | null>(null);

const invalidateComments = (_: unknown, vars: { projectId: string; taskId: string }) =>
  invalidate(
    getListCommentsQueryKey(vars.projectId, vars.taskId),
    listProjectCommentsKeyPrefix(vars.projectId),
  );
const createCommentMutation = useCreateComment({ mutation: { onSuccess: invalidateComments } });
const updateCommentMutation = useUpdateComment({ mutation: { onSuccess: invalidateComments } });

function canEditComment(comment: TaskComment) {
  return props.editable && comment.author.id === props.currentUserId;
}

function postComment(body: RichTextDoc) {
  return createCommentMutation.mutateAsync({
    projectId: props.projectId,
    taskId: props.taskId,
    createCommentRequest: { body },
  });
}

function updateComment(commentId: string, body: RichTextDoc) {
  return updateCommentMutation.mutateAsync({
    projectId: props.projectId,
    taskId: props.taskId,
    commentId,
    updateCommentRequest: { body },
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP');
}
</script>

<template>
  <div class="comment-thread space-y-4">
    <p v-if="commentsError" class="text-sm text-destructive" role="alert">{{ commentsError }}</p>
    <TimelineItem
      v-for="comment in comments"
      :key="comment.id"
      :author="comment.author"
      :created-at="comment.createdAt"
      data-testid="comment"
    >
      <template #meta>
        <span
          v-if="comment.editedAt"
          class="text-muted-foreground"
          data-testid="comment-edited"
          :title="formatDate(comment.editedAt)"
        >
          編集済み
        </span>
      </template>
      <template #actions>
        <Button
          v-if="canEditComment(comment) && editingCommentId !== comment.id"
          type="button"
          variant="ghost"
          size="sm"
          @click="editingCommentId = comment.id"
        >
          編集
        </Button>
      </template>
      <RichTextForm
        v-if="editingCommentId === comment.id"
        :project-id="projectId"
        :draft-key="draftKeys.comment(taskId, comment.id)"
        :initial-doc="comment.body"
        label="コメントを編集"
        submit-label="保存"
        cancelable
        :error-messages="COMMENT_ERRORS"
        :submit="(body) => updateComment(comment.id, body)"
        @submitted="editingCommentId = null"
        @cancel="editingCommentId = null"
      />
      <RichTextContent
        v-else-if="!isRichTextDocEmpty(comment.body)"
        class="comment-body"
        :doc="comment.body"
      />
    </TimelineItem>
    <section v-if="editable" class="border-t pt-4">
      <h2 class="mb-2 text-sm font-semibold">コメントする</h2>
      <RichTextForm
        data-testid="create-comment"
        :project-id="projectId"
        :draft-key="draftKeys.newComment(taskId)"
        :initial-doc="emptyRichTextDoc()"
        label="コメント"
        placeholder="コメントを書く"
        submit-label="コメント"
        :error-messages="COMMENT_ERRORS"
        :submit="postComment"
      >
        <template v-if="$slots['form-actions']" #actions>
          <slot name="form-actions" />
        </template>
      </RichTextForm>
    </section>
  </div>
</template>
