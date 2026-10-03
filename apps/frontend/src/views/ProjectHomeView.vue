<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { isRichTextDocEmpty } from '@pm-tool/shared';
import {
  useGetProject,
  useListMembers,
  useListProjectComments,
  useListTasks,
} from '../api/generated';
import type { Task } from '../api/generated/models';
import UserAvatar from '../components/UserAvatar.vue';
import RichTextContent from '../components/rich-text/RichTextContent.vue';
import RelativeTime from '../components/task/RelativeTime.vue';
import TaskLabelPill from '../components/task/TaskLabelPill.vue';
import TaskStateIcon from '../components/task/TaskStateIcon.vue';
import EmptyState from '../components/layout/EmptyState.vue';
import ProjectHeader from '../components/layout/ProjectHeader.vue';
import ProjectNotFound from '../components/layout/ProjectNotFound.vue';
import ProjectOverview from '../components/layout/ProjectOverview.vue';
import { ApiRequestError, errorMessage } from '../lib/api';
import { addDays, startOfWeek, todayString, type DateString } from '../lib/dates';
import { dueStateClass } from '../lib/due-state';

const WEEK_TASK_LIMIT = 5;
const COMMENT_LIMIT = 5;

const route = useRoute();

const projectId = computed(() => String(route.params.projectId));

const projectQuery = useGetProject(projectId);
const tasksQuery = useListTasks(projectId);
const commentsQuery = useListProjectComments(projectId, { limit: COMMENT_LIMIT });
const membersQuery = useListMembers(projectId);

const project = computed(() => projectQuery.data.value ?? null);
const comments = computed(() => commentsQuery.data.value ?? []);
// The member count is decoration on the overview, so a failed load only hides it.
const members = computed(() => (membersQuery.error.value ? undefined : membersQuery.data.value));

const firstLoadError = computed(
  () => projectQuery.error.value ?? tasksQuery.error.value ?? commentsQuery.error.value,
);
const projectNotFound = computed(() => {
  const e = firstLoadError.value;
  return e instanceof ApiRequestError && e.status === 404;
});
const loadError = computed(() => {
  if (projectNotFound.value) return '';
  const e = firstLoadError.value;
  return e ? errorMessage(e, {}, 'プロジェクトの読み込みに失敗しました') : '';
});

function overlapsWeek(task: Task, weekStart: DateString, weekEnd: DateString) {
  // A task with only one date is treated as a single day on that date.
  const start = task.startDate ?? task.endDate;
  const end = task.endDate ?? task.startDate;
  if (start === null || end === null) return false;
  return start <= weekEnd && end >= weekStart;
}

function compareStartDate(a: Task, b: Task) {
  if (a.startDate === b.startDate) return 0;
  if (a.startDate === null) return 1;
  if (b.startDate === null) return -1;
  return a.startDate < b.startDate ? -1 : 1;
}

const weekTasks = computed(() => {
  const weekStart = startOfWeek(todayString());
  const weekEnd = addDays(weekStart, 6);
  return (tasksQuery.data.value ?? [])
    .filter((task) => overlapsWeek(task, weekStart, weekEnd))
    .sort(compareStartDate)
    .slice(0, WEEK_TASK_LIMIT);
});

function taskPeriod(task: Task) {
  return `${task.startDate ?? ''} 〜 ${task.endDate ?? ''}`.trim();
}
</script>

<template>
  <div>
    <ProjectNotFound v-if="projectNotFound" />
    <p v-if="loadError" class="my-4 text-destructive" role="alert">{{ loadError }}</p>
    <template v-if="project">
      <ProjectHeader :project="project" />
      <ProjectOverview :project="project" :members="members" :tasks="tasksQuery.data.value" />

      <div class="grid gap-8 lg:grid-cols-2">
        <section class="min-w-0 space-y-3" aria-labelledby="week-tasks-heading">
          <h2 id="week-tasks-heading" class="text-lg font-semibold">今週のタスク</h2>
          <EmptyState v-if="weekTasks.length === 0" message="今週のタスクはありません" />
          <ul v-else class="divide-y rounded-lg border">
            <li
              v-for="task in weekTasks"
              :key="task.id"
              class="flex items-start gap-3 px-4 py-3 hover:bg-muted/30"
              data-testid="week-task"
            >
              <TaskStateIcon class="mt-0.5" :status="task.status" />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <RouterLink
                    :to="{ name: 'task', params: { projectId, taskId: task.id } }"
                    class="min-w-0 font-semibold break-words hover:text-primary hover:underline"
                    data-testid="week-task-open"
                  >
                    {{ task.title }}
                  </RouterLink>
                  <TaskLabelPill
                    v-if="task.label"
                    :label="task.label"
                    data-testid="week-task-label"
                  />
                </div>
                <p
                  class="mt-1 text-xs"
                  :class="dueStateClass(task.endDate, task.status) || 'text-muted-foreground'"
                  data-testid="week-task-period"
                >
                  {{ taskPeriod(task) }}
                </p>
              </div>
              <UserAvatar
                v-if="task.assignee"
                :user-id="task.assignee.id"
                :name="task.assignee.name"
                :avatar-url="task.assignee.avatarUrl"
                :size="20"
                :title="task.assignee.name"
                data-testid="week-task-assignee"
              />
            </li>
          </ul>
        </section>

        <section class="min-w-0 space-y-3" aria-labelledby="recent-comments-heading">
          <h2 id="recent-comments-heading" class="text-lg font-semibold">最新のコメント</h2>
          <EmptyState v-if="comments.length === 0" message="コメントはありません" />
          <ul v-else class="space-y-3">
            <li
              v-for="comment in comments"
              :key="comment.id"
              class="overflow-hidden rounded-lg border bg-background"
              data-testid="recent-comment"
            >
              <div
                class="flex min-h-10 flex-wrap items-center gap-2 border-b bg-muted/50 px-4 py-1.5 text-sm"
              >
                <UserAvatar
                  :user-id="comment.author.id"
                  :name="comment.author.name"
                  :avatar-url="comment.author.avatarUrl"
                  :size="20"
                />
                <span class="font-semibold" data-testid="recent-comment-author">
                  {{ comment.author.name }}
                </span>
                <RelativeTime :datetime="comment.createdAt" class="text-muted-foreground" />
                <RouterLink
                  :to="{ name: 'task', params: { projectId, taskId: comment.task.id } }"
                  class="ml-auto min-w-0 break-words text-muted-foreground hover:text-primary hover:underline"
                  data-testid="recent-comment-task"
                >
                  {{ comment.task.title }}
                </RouterLink>
              </div>
              <div v-if="!isRichTextDocEmpty(comment.body)" class="p-4">
                <RichTextContent :doc="comment.body" data-testid="recent-comment-body" />
              </div>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
