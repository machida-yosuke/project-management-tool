<script setup lang="ts">
import { ref } from 'vue';
import { emptyRichTextDoc, isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import { getListCommentsQueryKey, useCreateComment, useUpdateComment } from '../api/generated';
import type { TaskComment } from '../api/generated/models';
import { draftKeys } from '../lib/drafts';
import { useInvalidate } from '../lib/query';
import RichTextContent from './rich-text/RichTextContent.vue';
import RichTextForm from './rich-text/RichTextForm.vue';
import UserAvatar from './UserAvatar.vue';

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
  invalidate(getListCommentsQueryKey(vars.projectId, vars.taskId));
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
  <div class="comment-thread">
    <p v-if="commentsError" class="error" role="alert">{{ commentsError }}</p>
    <p v-else-if="comments.length === 0" class="muted">コメントはありません</p>
    <ul class="comment-list">
      <li v-for="comment in comments" :key="comment.id" data-testid="comment">
        <div class="comment-meta muted">
          <UserAvatar
            :name="comment.author.name"
            :avatar-url="comment.author.avatarUrl"
            :size="20"
          />
          {{ comment.author.name }} ・ {{ formatDate(comment.createdAt) }}
          <span
            v-if="comment.editedAt"
            data-testid="comment-edited"
            :title="formatDate(comment.editedAt)"
          >
            更新履歴あり
          </span>
        </div>
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
        <template v-else>
          <RichTextContent
            v-if="!isRichTextDocEmpty(comment.body)"
            class="comment-body"
            :doc="comment.body"
          />
          <button
            v-if="canEditComment(comment)"
            type="button"
            class="edit"
            @click="editingCommentId = comment.id"
          >
            編集
          </button>
        </template>
      </li>
    </ul>
    <RichTextForm
      v-if="editable"
      data-testid="create-comment"
      :project-id="projectId"
      :draft-key="draftKeys.newComment(taskId)"
      :initial-doc="emptyRichTextDoc()"
      label="コメント"
      placeholder="コメントを書く"
      submit-label="投稿"
      :error-messages="COMMENT_ERRORS"
      :submit="postComment"
    />
  </div>
</template>

<style scoped>
.comment-list {
  list-style: none;
  padding: 0;
}

.comment-list > li {
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}

.comment-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.edit {
  margin-top: 4px;
  font-size: 0.85em;
}

.muted {
  color: #666;
}

.error {
  color: #c00;
}
</style>
