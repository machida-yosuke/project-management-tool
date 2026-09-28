<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { TASK_COLORS, type TaskColor } from '@pm-tool/shared';
import type { Task, TaskComment } from '../../api/generated/models';
import UserAvatar from '../UserAvatar.vue';
import { TASK_COLOR_HEX, TASK_COLOR_LABELS } from '../../lib/task-colors';

defineProps<{
  task: Task;
  comments: TaskComment[];
  commentsError: string;
  editable: boolean;
}>();

const emit = defineEmits<{
  close: [];
  changeColor: [color: TaskColor];
  archive: [];
  unarchive: [];
  postComment: [];
}>();

const commentDraft = defineModel<string>('commentDraft', { required: true });

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('ja-JP');
}
</script>

<template>
  <aside class="panel" data-testid="task-panel" :aria-label="`${task.title} の詳細`">
    <div class="panel-header">
      <h3>{{ task.title }}</h3>
      <button type="button" aria-label="閉じる" @click="emit('close')">×</button>
    </div>
    <p v-if="task.description" class="description">{{ task.description }}</p>
    <dl class="fields">
      <dt>状態</dt>
      <dd data-testid="task-status">{{ task.status === 'done' ? '完了' : '未完了' }}</dd>
      <dt>担当</dt>
      <dd class="assignee">
        <UserAvatar
          v-if="task.assignee"
          :name="task.assignee.name"
          :avatar-url="task.assignee.avatarUrl"
          :size="20"
        />
        <span>{{ task.assignee?.name ?? '未割り当て' }}</span>
      </dd>
      <dt>期間</dt>
      <dd data-testid="task-period">
        {{ task.startDate && task.endDate ? `${task.startDate} 〜 ${task.endDate}` : '未設定' }}
      </dd>
      <dt v-if="task.archivedAt !== null">アーカイブ</dt>
      <dd v-if="task.archivedAt !== null">{{ formatTimestamp(task.archivedAt) }}</dd>
    </dl>

    <div v-if="editable" class="actions">
      <div class="swatches" role="group" aria-label="色">
        <button
          v-for="color in TASK_COLORS"
          :key="color"
          type="button"
          class="swatch"
          :style="{ backgroundColor: TASK_COLOR_HEX[color] }"
          :aria-label="`色: ${TASK_COLOR_LABELS[color]}`"
          :aria-pressed="task.color === color ? 'true' : 'false'"
          @click="emit('changeColor', color)"
        />
      </div>
      <button v-if="task.archivedAt === null" type="button" @click="emit('archive')">
        アーカイブ
      </button>
      <button v-else type="button" @click="emit('unarchive')">復元</button>
    </div>

    <h4>コメント</h4>
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
          {{ comment.author.name }} ・ {{ formatTimestamp(comment.createdAt) }}
        </div>
        <div class="comment-body">{{ comment.body }}</div>
      </li>
    </ul>
    <form
      v-if="editable"
      class="stack-form"
      data-testid="create-comment"
      @submit.prevent="emit('postComment')"
    >
      <textarea
        v-model="commentDraft"
        placeholder="コメントを書く"
        required
        maxlength="4000"
        aria-label="コメント"
      />
      <button type="submit">投稿</button>
    </form>
  </aside>
</template>

<style scoped>
.panel {
  border-left: 1px solid #ddd;
  padding-left: 16px;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.panel-header h3 {
  margin: 0;
}

.description {
  white-space: pre-wrap;
}

.fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  font-size: 0.9em;
}

.fields dd {
  margin: 0;
}

.assignee,
.comment-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
}

.swatches {
  display: flex;
  gap: 4px;
}

.swatch {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
}

.swatch[aria-pressed='true'] {
  border-color: #111;
}

.comment-list {
  list-style: none;
  padding: 0;
}

.comment-list > li {
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}

.comment-body {
  white-space: pre-wrap;
}

.stack-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.muted {
  color: #666;
}

.error {
  color: #c00;
}
</style>
