<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { canEdit, type TaskColor } from '@pm-tool/shared';
import {
  useArchiveTask,
  useGetProject,
  useListComments,
  useListTasks,
  useUnarchiveTask,
  useUpdateTask,
} from '../api/generated';
import TaskDetailPanel from '../components/calendar/TaskDetailPanel.vue';
import TimelineGrid from '../components/calendar/TimelineGrid.vue';
import { ApiRequestError, errorMessage } from '../lib/api';
import type { DateRange } from '../lib/calendar-drag';
import {
  addDays,
  addMonths,
  formatMonthLabel,
  formatWeekRangeLabel,
  isDateString,
  monthDays,
  parseDate,
  todayString,
  weekOf,
  type DateString,
} from '../lib/dates';
import { listTasksKeyPrefix, useInvalidate } from '../lib/query';
import { useAuthStore } from '../stores/auth';

type ViewMode = 'month' | 'week';

const route = useRoute();
const router = useRouter();
const invalidate = useInvalidate();
const authStore = useAuthStore();

const projectId = computed(() => String(route.params.projectId));
const today = ref(todayString());
const viewMode = ref<ViewMode>('month');
const showArchived = ref(false);
const selectedTaskId = ref<string | null>(null);
const dateOverrides = reactive<Record<string, DateRange>>({});
const actionError = ref('');

function dateFromQuery(value: unknown): DateString {
  return typeof value === 'string' && isDateString(value) ? value : today.value;
}

// Kept locally and updated before `router.replace` resolves so repeated clicks build on each other.
const baseDate = ref<DateString>(dateFromQuery(route.query.date));
watch(
  () => route.query.date,
  (value) => {
    baseDate.value = dateFromQuery(value);
  },
);

const dates = computed(() => {
  if (viewMode.value === 'week') return weekOf(baseDate.value);
  const { year, month } = parseDate(baseDate.value);
  return monthDays(year, month);
});
const columnWidth = computed(() => (viewMode.value === 'week' ? 120 : 40));
const label = computed(() => {
  const firstDay = dates.value[0];
  if (viewMode.value === 'week' && firstDay !== undefined) return formatWeekRangeLabel(firstDay);
  return formatMonthLabel(baseDate.value);
});

const projectQuery = useGetProject(projectId);
const tasksQuery = useListTasks(projectId, () =>
  showArchived.value ? { includeArchived: true } : undefined,
);
const commentsQuery = useListComments(
  projectId,
  () => selectedTaskId.value ?? '',
  () => ({ query: { enabled: selectedTaskId.value !== null } }),
);

const project = computed(() => projectQuery.data.value ?? null);
const tasks = computed(() => tasksQuery.data.value ?? []);
const comments = computed(() => commentsQuery.data.value ?? []);
const selectedTask = computed(
  () => tasks.value.find((task) => task.id === selectedTaskId.value) ?? null,
);
const editable = computed(() => (project.value ? canEdit(project.value.role) : false));

const loadError = computed(() => {
  const e = projectQuery.error.value ?? tasksQuery.error.value;
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

watch(projectId, () => {
  selectedTaskId.value = null;
});

function invalidateTasks() {
  return invalidate(listTasksKeyPrefix(projectId.value));
}

const updateTaskMutation = useUpdateTask({ mutation: { onSuccess: invalidateTasks } });
const archiveTaskMutation = useArchiveTask({
  mutation: {
    onSuccess: (_, vars) => {
      if (!showArchived.value && selectedTaskId.value === vars.taskId) {
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

function navigate(date: DateString) {
  baseDate.value = date;
  return router.replace({ query: { ...route.query, date } });
}

function goPrevious() {
  return navigate(
    viewMode.value === 'month' ? addMonths(baseDate.value, -1) : addDays(baseDate.value, -7),
  );
}

function goNext() {
  return navigate(
    viewMode.value === 'month' ? addMonths(baseDate.value, 1) : addDays(baseDate.value, 7),
  );
}

function goToday() {
  today.value = todayString();
  return navigate(today.value);
}

function openTask(taskId: string) {
  selectedTaskId.value = taskId;
}

function closePanel() {
  selectedTaskId.value = null;
}

async function commitDates({ taskId, startDate, endDate }: { taskId: string } & DateRange) {
  dateOverrides[taskId] = { startDate, endDate };
  // On success the invalidated query already holds the new dates; on failure the store's original shows again.
  try {
    await runAction(
      () =>
        updateTaskMutation.mutateAsync({
          projectId: projectId.value,
          taskId,
          updateTaskRequest: { startDate, endDate },
        }),
      { invalid_date_range: '終了日は開始日以降にしてください' },
    );
  } finally {
    delete dateOverrides[taskId];
  }
}

function changeColor(color: TaskColor) {
  const taskId = selectedTaskId.value;
  if (!taskId) return;
  return runAction(() =>
    updateTaskMutation.mutateAsync({
      projectId: projectId.value,
      taskId,
      updateTaskRequest: { color },
    }),
  );
}

function archiveSelected() {
  const taskId = selectedTaskId.value;
  if (!taskId) return;
  return runAction(() => archiveTaskMutation.mutateAsync({ projectId: projectId.value, taskId }));
}

function unarchiveSelected() {
  const taskId = selectedTaskId.value;
  if (!taskId) return;
  return runAction(() => unarchiveTaskMutation.mutateAsync({ projectId: projectId.value, taskId }));
}
</script>

<template>
  <div>
    <p v-if="loadError" class="error" role="alert">{{ loadError }}</p>
    <div v-if="project">
      <header class="header">
        <h2>{{ project.name }} のカレンダー</h2>
        <router-link :to="{ name: 'project', params: { projectId: project.id } }">
          タスク
        </router-link>
        <router-link :to="{ name: 'project-members', params: { projectId: project.id } }">
          メンバー
        </router-link>
      </header>
      <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>

      <div class="toolbar">
        <button type="button" @click="goPrevious">前へ</button>
        <button type="button" @click="goToday">今日</button>
        <button type="button" @click="goNext">次へ</button>
        <span class="label" data-testid="calendar-label">{{ label }}</span>
        <div class="mode-switch" role="group" aria-label="表示">
          <button
            type="button"
            :aria-pressed="viewMode === 'month' ? 'true' : 'false'"
            @click="viewMode = 'month'"
          >
            月
          </button>
          <button
            type="button"
            :aria-pressed="viewMode === 'week' ? 'true' : 'false'"
            @click="viewMode = 'week'"
          >
            週
          </button>
        </div>
        <label>
          <input v-model="showArchived" type="checkbox" aria-label="アーカイブを表示" />
          アーカイブを表示
        </label>
      </div>

      <div class="layout" :class="{ 'with-panel': selectedTask }">
        <TimelineGrid
          :dates="dates"
          :tasks="tasks"
          :editable="editable"
          :today="today"
          :selected-task-id="selectedTaskId"
          :date-overrides="dateOverrides"
          :column-width="columnWidth"
          @open="openTask"
          @commit="commitDates"
        />
        <TaskDetailPanel
          v-if="selectedTask"
          :task="selectedTask"
          :comments="comments"
          :comments-error="commentsError"
          :editable="editable"
          :current-user-id="authStore.user?.id ?? null"
          @close="closePanel"
          @change-color="changeColor"
          @archive="archiveSelected"
          @unarchive="unarchiveSelected"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.label {
  min-width: 12em;
  font-weight: bold;
}

.mode-switch {
  display: inline-flex;
}

.mode-switch button[aria-pressed='true'] {
  background: #1d4ed8;
  color: #fff;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.layout.with-panel {
  grid-template-columns: minmax(0, 1fr) minmax(240px, 320px);
}

@media (max-width: 720px) {
  .layout.with-panel {
    grid-template-columns: minmax(0, 1fr);
  }
}

.error {
  color: #c00;
}
</style>
