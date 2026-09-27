<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { canEdit, type Task } from '@pm-tool/shared';
import UserAvatar from '../components/UserAvatar.vue';
import { ApiRequestError, errorMessage } from '../lib/api';
import { eventValue } from '../lib/form';
import { useMembersStore } from '../stores/members';
import { useProjectsStore } from '../stores/projects';
import { useTasksStore } from '../stores/tasks';

const route = useRoute();
const projectsStore = useProjectsStore();
const tasksStore = useTasksStore();
const membersStore = useMembersStore();

const projectId = computed(() => String(route.params.projectId));
const project = computed(() =>
  projectsStore.current?.id === projectId.value ? projectsStore.current : null,
);
const editable = computed(() => (project.value ? canEdit(project.value.role) : false));

const loadError = ref('');
const actionError = ref('');
const newTitle = ref('');
const newComment = ref('');

watch(
  projectId,
  async (id) => {
    loadError.value = '';
    try {
      await Promise.all([
        projectsStore.fetchProject(id),
        tasksStore.fetchTasks(id),
        membersStore.fetchMembers(id),
      ]);
    } catch (e) {
      // Non-members get 404 so the project's existence is not leaked.
      loadError.value =
        e instanceof ApiRequestError && e.status === 404
          ? 'プロジェクトが見つかりません'
          : errorMessage(e, {}, 'プロジェクトの読み込みに失敗しました');
    }
  },
  { immediate: true },
);

async function runAction(action: () => Promise<unknown>, messages: Record<string, string> = {}) {
  actionError.value = '';
  try {
    await action();
  } catch (e) {
    actionError.value = errorMessage(e, messages, '操作に失敗しました');
  }
}

function createTask() {
  return runAction(
    async () => {
      await tasksStore.createTask(projectId.value, { title: newTitle.value.trim() });
      newTitle.value = '';
    },
    { validation_error: 'タイトルは1〜200文字で入力してください' },
  );
}

function toggleDone(task: Task) {
  return runAction(() =>
    tasksStore.updateTask(projectId.value, task.id, {
      status: task.status === 'done' ? 'open' : 'done',
    }),
  );
}

function assign(task: Task, event: Event) {
  const value = eventValue(event);
  return runAction(
    () =>
      tasksStore.updateTask(projectId.value, task.id, { assigneeId: value === '' ? null : value }),
    { assignee_not_member: '担当者はプロジェクトメンバーから選んでください' },
  );
}

function deleteTask(task: Task) {
  return runAction(() => tasksStore.deleteTask(projectId.value, task.id));
}

function selectTask(task: Task) {
  return runAction(() => tasksStore.selectTask(projectId.value, task.id));
}

function postComment() {
  const taskId = tasksStore.selectedTaskId;
  if (!taskId) return;
  return runAction(
    async () => {
      await tasksStore.postComment(projectId.value, taskId, newComment.value.trim());
      newComment.value = '';
    },
    { validation_error: 'コメントは1〜4000文字で入力してください' },
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP');
}
</script>

<template>
  <div>
    <p v-if="loadError" class="error" role="alert">{{ loadError }}</p>
    <template v-if="project">
      <header class="header">
        <h2>{{ project.name }}</h2>
        <router-link :to="{ name: 'project-members', params: { projectId: project.id } }">
          メンバー
        </router-link>
      </header>
      <p v-if="project.description" class="muted">{{ project.description }}</p>
      <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>

      <div class="columns">
        <section class="tasks">
          <h3>TODO</h3>
          <form
            v-if="editable"
            class="inline-form"
            data-testid="create-task"
            @submit.prevent="createTask"
          >
            <input
              v-model="newTitle"
              type="text"
              placeholder="TODO を追加"
              required
              maxlength="200"
              aria-label="TODO のタイトル"
            />
            <button type="submit">追加</button>
          </form>
          <p v-if="tasksStore.tasks.length === 0">TODO はありません</p>
          <ul class="task-list">
            <li
              v-for="task in tasksStore.tasks"
              :key="task.id"
              :class="{
                selected: task.id === tasksStore.selectedTaskId,
                done: task.status === 'done',
              }"
              data-testid="task"
            >
              <div class="task-row">
                <input
                  v-if="editable"
                  type="checkbox"
                  :checked="task.status === 'done'"
                  aria-label="完了"
                  @change="toggleDone(task)"
                />
                <span v-else>{{ task.status === 'done' ? '完了' : '未完了' }}</span>
                <button type="button" class="link" @click="selectTask(task)">
                  {{ task.title }}
                </button>
                <button v-if="editable" type="button" @click="deleteTask(task)">削除</button>
              </div>
              <div class="task-meta">
                <UserAvatar
                  v-if="task.assignee"
                  :name="task.assignee.name"
                  :avatar-url="task.assignee.avatarUrl"
                  :size="20"
                />
                <label v-if="editable">
                  担当:
                  <select
                    :value="task.assignee?.id ?? ''"
                    aria-label="担当者"
                    @change="assign(task, $event)"
                  >
                    <option value="">未割り当て</option>
                    <option
                      v-for="member in membersStore.members"
                      :key="member.userId"
                      :value="member.userId"
                    >
                      {{ member.name }}
                    </option>
                  </select>
                </label>
                <span v-else>担当: {{ task.assignee?.name ?? '未割り当て' }}</span>
                <UserAvatar
                  :name="task.createdBy.name"
                  :avatar-url="task.createdBy.avatarUrl"
                  :size="20"
                />
                <span class="muted">作成: {{ task.createdBy.name }}</span>
              </div>
            </li>
          </ul>
        </section>

        <section class="thread" data-testid="thread">
          <template v-if="tasksStore.selectedTask">
            <h3>{{ tasksStore.selectedTask.title }}</h3>
            <p v-if="tasksStore.selectedTask.description">
              {{ tasksStore.selectedTask.description }}
            </p>
            <p v-if="tasksStore.comments.length === 0" class="muted">コメントはありません</p>
            <ul class="comment-list">
              <li v-for="comment in tasksStore.comments" :key="comment.id" data-testid="comment">
                <div class="comment-meta muted">
                  <UserAvatar
                    :name="comment.author.name"
                    :avatar-url="comment.author.avatarUrl"
                    :size="20"
                  />
                  {{ comment.author.name }} ・ {{ formatDate(comment.createdAt) }}
                </div>
                <div class="comment-body">{{ comment.body }}</div>
              </li>
            </ul>
            <form
              v-if="editable"
              class="stack-form"
              data-testid="create-comment"
              @submit.prevent="postComment"
            >
              <textarea
                v-model="newComment"
                placeholder="コメントを書く"
                required
                maxlength="4000"
                aria-label="コメント"
              />
              <button type="submit">投稿</button>
            </form>
          </template>
          <p v-else class="muted">TODO を選択するとスレッドが表示されます</p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

@media (max-width: 720px) {
  .columns {
    grid-template-columns: minmax(0, 1fr);
  }
}

.thread {
  border-left: 1px solid #ddd;
  padding-left: 24px;
}

.task-list,
.comment-list {
  list-style: none;
  padding: 0;
}

.task-list > li {
  padding: 8px;
  border-bottom: 1px solid #ddd;
}

.task-list > li.selected {
  background: #eef4ff;
}

.task-list > li.done .link {
  text-decoration: line-through;
  color: #666;
}

.task-row,
.task-meta,
.comment-meta,
.inline-form {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-meta {
  margin-top: 4px;
  font-size: 0.9em;
}

.link {
  flex: 1;
  text-align: left;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
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
