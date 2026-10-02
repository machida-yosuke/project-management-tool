<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { canEdit } from '@pm-tool/shared';
import { useGetProject, useListTasks, useUpdateTask } from '../api/generated';
import TimelineGrid from '../components/calendar/TimelineGrid.vue';
import ProjectHeader from '../components/layout/ProjectHeader.vue';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
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

type ViewMode = 'month' | 'week';

const route = useRoute();
const router = useRouter();
const invalidate = useInvalidate();

const projectId = computed(() => String(route.params.projectId));
const today = ref(todayString());
const viewMode = ref<ViewMode>('month');
const showArchived = ref(false);
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

const project = computed(() => projectQuery.data.value ?? null);
const tasks = computed(() => tasksQuery.data.value ?? []);
const editable = computed(() => (project.value ? canEdit(project.value.role) : false));

const loadError = computed(() => {
  const e = projectQuery.error.value ?? tasksQuery.error.value;
  if (!e) return '';
  // Non-members get 404 so the project's existence is not leaked.
  return e instanceof ApiRequestError && e.status === 404
    ? 'プロジェクトが見つかりません'
    : errorMessage(e, {}, 'プロジェクトの読み込みに失敗しました');
});

function invalidateTasks() {
  return invalidate(listTasksKeyPrefix(projectId.value));
}

const updateTaskMutation = useUpdateTask({ mutation: { onSuccess: invalidateTasks } });

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
  return router.push({ name: 'task', params: { projectId: projectId.value, taskId } });
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
</script>

<template>
  <div>
    <p v-if="loadError" class="my-4 text-destructive" role="alert">{{ loadError }}</p>
    <div v-if="project">
      <ProjectHeader :project="project" />
      <p v-if="actionError" class="mb-4 text-sm text-destructive" role="alert">
        {{ actionError }}
      </p>

      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" @click="goPrevious">前へ</Button>
          <Button type="button" variant="outline" size="sm" @click="goToday">今日</Button>
          <Button type="button" variant="outline" size="sm" @click="goNext">次へ</Button>
          <span class="ml-2 text-sm font-medium" data-testid="calendar-label">{{ label }}</span>
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <div class="inline-flex rounded-md border p-0.5" role="group" aria-label="表示">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              :class="{ 'bg-accent': viewMode === 'month' }"
              :aria-pressed="viewMode === 'month' ? 'true' : 'false'"
              @click="viewMode = 'month'"
            >
              月
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              :class="{ 'bg-accent': viewMode === 'week' }"
              :aria-pressed="viewMode === 'week' ? 'true' : 'false'"
              @click="viewMode = 'week'"
            >
              週
            </Button>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="calendar-show-archived"
              :model-value="showArchived"
              @update:model-value="showArchived = $event === true"
            />
            <Label for="calendar-show-archived">アーカイブを表示</Label>
          </div>
        </div>
      </div>

      <!-- TimelineGrid draws its own border; the wrapper owns the frame instead. -->
      <div class="overflow-hidden rounded-lg border *:rounded-none *:border-0">
        <TimelineGrid
          :dates="dates"
          :tasks="tasks"
          :editable="editable"
          :today="today"
          :date-overrides="dateOverrides"
          :column-width="columnWidth"
          @open="openTask"
          @commit="commitDates"
        />
      </div>
    </div>
  </div>
</template>
