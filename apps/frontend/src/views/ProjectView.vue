<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { TASK_COLORS, canEdit } from '@pm-tool/shared';
import {
  useArchiveTask,
  useCreateTask,
  useGetProject,
  useListComments,
  useListMembers,
  useListTasks,
  useUnarchiveTask,
  useUpdateTask,
} from '../api/generated';
import type { Task, UpdateTaskRequest } from '../api/generated/models';
import CommentThread from '../components/CommentThread.vue';
import TaskDescription from '../components/TaskDescription.vue';
import UserAvatar from '../components/UserAvatar.vue';
import { ApiRequestError, errorMessage } from '../lib/api';
import { eventValue } from '../lib/form';
import { listTasksKeyPrefix, useInvalidate } from '../lib/query';
import { TASK_COLOR_HEX, TASK_COLOR_LABELS } from '../lib/task-colors';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const invalidate = useInvalidate();
const authStore = useAuthStore();

const projectId = computed(() => String(route.params.projectId));
const selectedTaskId = ref<string | null>(null);
const includeArchived = ref(false);

const projectQuery = useGetProject(projectId);
// Omit the param when off so the default request stays `GET /tasks` with no query string.
const tasksQuery = useListTasks(projectId, () => ({
  includeArchived: includeArchived.value || undefined,
}));
const membersQuery = useListMembers(projectId);
const commentsQuery = useListComments(
  projectId,
  () => selectedTaskId.value ?? '',
  () => ({ query: { enabled: selectedTaskId.value !== null } }),
);

const project = computed(() => projectQuery.data.value ?? null);
const tasks = computed(() => tasksQuery.data.value ?? []);
const members = computed(() => membersQuery.data.value ?? []);
const comments = computed(() => commentsQuery.data.value ?? []);
const selectedTask = computed(
  () => tasks.value.find((task) => task.id === selectedTaskId.value) ?? null,
);
const editable = computed(() => (project.value ? canEdit(project.value.role) : false));

const loadError = computed(() => {
  const e = projectQuery.error.value ?? tasksQuery.error.value ?? membersQuery.error.value;
  if (!e) return '';
  // Non-members get 404 so the project's existence is not leaked.
  return e instanceof ApiRequestError && e.status === 404
    ? 'プロジェクトが見つかりません'
    : errorMessage(e, {}, 'プロジェクトの読み込みに失敗しました');
});
const commentsError = computed(() => {
  const e = commentsQuery.error.value;
  return e ? errorMessage(e, {}, 'コメントの読み込みに失敗しました') : '';
});
const actionError = ref('');
const newTitle = ref('');

watch(projectId, () => {
  selectedTaskId.value = null;
});

function invalidateTasks() {
  return invalidate(listTasksKeyPrefix(projectId.value));
}

const createTaskMutation = useCreateTask({ mutation: { onSuccess: invalidateTasks } });
const updateTaskMutation = useUpdateTask({ mutation: { onSuccess: invalidateTasks } });
const archiveTaskMutation = useArchiveTask({
  mutation: {
    onSuccess: (_, vars) => {
      if (!includeArchived.value && selectedTaskId.value === vars.taskId) {
        selectedTaskId.value = null;
      }
      return invalidateTasks();
    },
  },
});
const unarchiveTaskMutation = useUnarchiveTask({ mutation: { onSuccess: invalidateTasks } });

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
      await createTaskMutation.mutateAsync({
        projectId: projectId.value,
        createTaskRequest: { title: newTitle.value.trim() },
      });
      newTitle.value = '';
    },
    { validation_error: 'タイトルは1〜200文字で入力してください' },
  );
}

function toggleDone(task: Task) {
  return runAction(() =>
    updateTaskMutation.mutateAsync({
      projectId: projectId.value,
      taskId: task.id,
      updateTaskRequest: { status: task.status === 'done' ? 'open' : 'done' },
    }),
  );
}

function assign(task: Task, event: Event) {
  const value = eventValue(event);
  return runAction(
    () =>
      updateTaskMutation.mutateAsync({
        projectId: projectId.value,
        taskId: task.id,
        updateTaskRequest: { assigneeId: value === '' ? null : value },
      }),
    { assignee_not_member: '担当者はプロジェクトメンバーから選んでください' },
  );
}

function changeDate(task: Task, field: 'startDate' | 'endDate', event: Event) {
  const value = eventValue(event);
  let range: Pick<UpdateTaskRequest, 'startDate' | 'endDate'>;
  if (value === '') {
    range = { startDate: null, endDate: null };
  } else if (field === 'startDate') {
    range = { startDate: value, endDate: task.endDate ?? value };
  } else {
    range = { startDate: task.startDate ?? value, endDate: value };
  }
  return runAction(
    () =>
      updateTaskMutation.mutateAsync({
        projectId: projectId.value,
        taskId: task.id,
        updateTaskRequest: range,
      }),
    { invalid_date_range: '終了日は開始日以降にしてください' },
  );
}

function changeColor(task: Task, event: Event) {
  const value = eventValue(event);
  const color = TASK_COLORS.find((c) => c === value);
  if (!color) throw new Error(`Unknown task color: ${value}`);
  return runAction(() =>
    updateTaskMutation.mutateAsync({
      projectId: projectId.value,
      taskId: task.id,
      updateTaskRequest: { color },
    }),
  );
}

function archiveTask(task: Task) {
  return runAction(() =>
    archiveTaskMutation.mutateAsync({ projectId: projectId.value, taskId: task.id }),
  );
}

function unarchiveTask(task: Task) {
  return runAction(() =>
    unarchiveTaskMutation.mutateAsync({ projectId: projectId.value, taskId: task.id }),
  );
}

function selectTask(task: Task) {
  selectedTaskId.value = task.id;
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
        <router-link :to="{ name: 'project-calendar', params: { projectId: project.id } }">
          カレンダー
        </router-link>
      </header>
      <p v-if="project.description" class="muted">{{ project.description }}</p>
      <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>

      <div class="columns">
        <section class="tasks">
          <h3>タスク</h3>
          <form
            v-if="editable"
            class="inline-form"
            data-testid="create-task"
            @submit.prevent="createTask"
          >
            <input
              v-model="newTitle"
              type="text"
              placeholder="タスクを追加"
              required
              maxlength="200"
              aria-label="タスクのタイトル"
            />
            <button type="submit">追加</button>
          </form>
          <label>
            <input v-model="includeArchived" type="checkbox" aria-label="アーカイブ済みも表示" />
            アーカイブ済みも表示
          </label>
          <p v-if="tasks.length === 0">タスクはありません</p>
          <ul class="task-list">
            <li
              v-for="task in tasks"
              :key="task.id"
              :class="{
                selected: task.id === selectedTaskId,
                done: task.status === 'done',
                archived: task.archivedAt !== null,
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
                <span class="color-dot" :style="{ background: TASK_COLOR_HEX[task.color] }" />
                <button type="button" class="link" @click="selectTask(task)">
                  {{ task.title }}
                </button>
                <template v-if="editable">
                  <button v-if="task.archivedAt === null" type="button" @click="archiveTask(task)">
                    アーカイブ
                  </button>
                  <button v-else type="button" @click="unarchiveTask(task)">復元</button>
                </template>
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
                    <option v-for="member in members" :key="member.userId" :value="member.userId">
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
              <div v-if="editable" class="task-meta">
                <input
                  type="date"
                  aria-label="開始日"
                  :value="task.startDate ?? ''"
                  @change="changeDate(task, 'startDate', $event)"
                />
                〜
                <input
                  type="date"
                  aria-label="終了日"
                  :value="task.endDate ?? ''"
                  @change="changeDate(task, 'endDate', $event)"
                />
                <select :value="task.color" aria-label="色" @change="changeColor(task, $event)">
                  <option v-for="color in TASK_COLORS" :key="color" :value="color">
                    {{ TASK_COLOR_LABELS[color] }}
                  </option>
                </select>
              </div>
              <div v-else class="task-meta">
                <span v-if="task.startDate && task.endDate">
                  期間: {{ task.startDate }} 〜 {{ task.endDate }}
                </span>
                <span>色: {{ TASK_COLOR_LABELS[task.color] }}</span>
              </div>
            </li>
          </ul>
        </section>

        <section class="thread" data-testid="thread">
          <!-- A <div>, not <template>: happy-dom returns null for form.nextSibling, which breaks fragment removal in tests. -->
          <div v-if="selectedTask">
            <h3>{{ selectedTask.title }}</h3>
            <TaskDescription :key="selectedTask.id" :task="selectedTask" :editable="editable" />
            <CommentThread
              :key="selectedTask.id"
              :project-id="projectId"
              :task-id="selectedTask.id"
              :comments="comments"
              :comments-error="commentsError"
              :editable="editable"
              :current-user-id="authStore.user?.id ?? null"
            />
          </div>
          <p v-else class="muted">タスクを選択するとスレッドが表示されます</p>
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

.task-list {
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

.task-list > li.archived {
  opacity: 0.5;
}

.task-list > li.done .link {
  text-decoration: line-through;
  color: #666;
}

.task-row,
.task-meta,
.inline-form {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-meta {
  margin-top: 4px;
  font-size: 0.9em;
}

.color-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
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

.muted {
  color: #666;
}

.error {
  color: #c00;
}
</style>
