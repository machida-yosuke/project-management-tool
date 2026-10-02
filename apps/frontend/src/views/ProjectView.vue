<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { canEdit, emptyRichTextDoc, isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import { CircleCheck, CircleDot } from '@lucide/vue';
import { useCreateTask, useGetProject, useListTasks } from '../api/generated';
import type { Task, TaskStatus } from '../api/generated/models';
import RichTextForm from '../components/rich-text/RichTextForm.vue';
import UserAvatar from '../components/UserAvatar.vue';
import RelativeTime from '../components/task/RelativeTime.vue';
import TaskLabelPill from '../components/task/TaskLabelPill.vue';
import TaskStateIcon from '../components/task/TaskStateIcon.vue';
import EmptyState from '../components/layout/EmptyState.vue';
import ProjectHeader from '../components/layout/ProjectHeader.vue';
import ProjectNotFound from '../components/layout/ProjectNotFound.vue';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ApiRequestError, errorMessage } from '../lib/api';
import { draftKeys } from '../lib/drafts';
import { dueStateClass } from '../lib/due-state';
import { listTasksKeyPrefix, useInvalidate } from '../lib/query';

const route = useRoute();
const invalidate = useInvalidate();

const projectId = computed(() => String(route.params.projectId));
const includeArchived = ref(false);
const statusFilter = ref<TaskStatus>('open');

const projectQuery = useGetProject(projectId);
// Omit the param when off so the default request stays `GET /tasks` with no query string.
const tasksQuery = useListTasks(projectId, () => ({
  includeArchived: includeArchived.value || undefined,
}));

const project = computed(() => projectQuery.data.value ?? null);
const tasks = computed(() => tasksQuery.data.value ?? []);
const openCount = computed(() => tasks.value.filter((t) => t.status === 'open').length);
const doneCount = computed(() => tasks.value.length - openCount.value);
const visibleTasks = computed(() => tasks.value.filter((t) => t.status === statusFilter.value));
const emptyMessage = computed(() =>
  statusFilter.value === 'open' ? '未完了のタスクはありません' : '完了したタスクはありません',
);
const editable = computed(() => (project.value ? canEdit(project.value.role) : false));

const firstLoadError = computed(() => projectQuery.error.value ?? tasksQuery.error.value);
const projectNotFound = computed(() => {
  const e = firstLoadError.value;
  return e instanceof ApiRequestError && e.status === 404;
});
const loadError = computed(() => {
  if (projectNotFound.value) return '';
  const e = firstLoadError.value;
  return e ? errorMessage(e, {}, 'プロジェクトの読み込みに失敗しました') : '';
});
const newTitle = ref('');
const createTaskOpen = ref(false);
const creatingTask = ref(false);

watch(projectId, () => {
  newTitle.value = '';
  createTaskOpen.value = false;
});

function invalidateTasks() {
  return invalidate(listTasksKeyPrefix(projectId.value));
}

const createTaskMutation = useCreateTask({ mutation: { onSuccess: invalidateTasks } });

const CREATE_TASK_ERRORS = { validation_error: 'タイトルは1〜200文字で入力してください' };

async function createTask(description: RichTextDoc) {
  creatingTask.value = true;
  try {
    await createTaskMutation.mutateAsync({
      projectId: projectId.value,
      createTaskRequest: {
        title: newTitle.value.trim(),
        ...(isRichTextDocEmpty(description) ? {} : { description }),
      },
    });
    newTitle.value = '';
  } finally {
    creatingTask.value = false;
  }
}

function onCreateTaskInteractOutside(event: Event) {
  if (creatingTask.value) event.preventDefault();
}

function taskPeriod(task: Task) {
  if (!task.startDate && !task.endDate) return '';
  return `${task.startDate ?? ''} 〜 ${task.endDate ?? ''}`.trim();
}
</script>

<template>
  <div>
    <ProjectNotFound v-if="projectNotFound" />
    <p v-if="loadError" class="my-4 text-destructive" role="alert">{{ loadError }}</p>
    <template v-if="project">
      <ProjectHeader :project="project" />

      <section class="space-y-4" aria-label="タスク">
        <div v-if="editable" class="flex justify-end">
          <Dialog v-model:open="createTaskOpen">
            <DialogTrigger as-child>
              <Button type="button" size="sm">タスクを作成</Button>
            </DialogTrigger>
            <DialogContent class="sm:max-w-2xl" @interact-outside="onCreateTaskInteractOutside">
              <DialogHeader>
                <DialogTitle>タスクを作成</DialogTitle>
              </DialogHeader>
              <RichTextForm
                :key="projectId"
                data-testid="create-task"
                :project-id="projectId"
                :draft-key="draftKeys.newTask(projectId)"
                :initial-doc="emptyRichTextDoc()"
                label="タスクの本文"
                placeholder="本文（任意）"
                submit-label="追加"
                allow-empty
                :error-messages="CREATE_TASK_ERRORS"
                :submit="createTask"
                @submitted="createTaskOpen = false"
              >
                <Input
                  v-model="newTitle"
                  type="text"
                  placeholder="タスクを追加"
                  required
                  maxlength="200"
                  aria-label="タスクのタイトル"
                />
              </RichTextForm>
            </DialogContent>
          </Dialog>
        </div>
        <div class="rounded-lg border">
          <div
            class="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2 text-sm"
          >
            <div class="flex items-center gap-4" role="group" aria-label="状態で絞り込む">
              <button
                type="button"
                class="inline-flex items-center gap-1.5"
                :class="
                  statusFilter === 'open'
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                "
                :aria-pressed="statusFilter === 'open'"
                data-testid="filter-open"
                @click="statusFilter = 'open'"
              >
                <CircleDot class="size-4 text-success" aria-hidden="true" />
                未完了 {{ openCount }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5"
                :class="
                  statusFilter === 'done'
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                "
                :aria-pressed="statusFilter === 'done'"
                data-testid="filter-done"
                @click="statusFilter = 'done'"
              >
                <CircleCheck class="size-4 text-info" aria-hidden="true" />
                完了 {{ doneCount }}
              </button>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox id="include-archived" v-model="includeArchived" />
              <Label for="include-archived" class="font-normal">アーカイブ済みも表示</Label>
            </div>
          </div>
          <EmptyState
            v-if="visibleTasks.length === 0"
            class="rounded-none border-0"
            :message="emptyMessage"
          />
          <ul v-else class="divide-y">
            <li
              v-for="task in visibleTasks"
              :key="task.id"
              class="flex items-start gap-3 px-4 py-3 hover:bg-muted/30"
              :class="{ done: task.status === 'done', archived: task.archivedAt !== null }"
              data-testid="task"
            >
              <TaskStateIcon class="mt-0.5" :status="task.status" />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <RouterLink
                    :to="{ name: 'task', params: { projectId, taskId: task.id } }"
                    class="min-w-0 font-semibold break-words hover:text-primary hover:underline"
                    data-testid="task-open"
                  >
                    {{ task.title }}
                  </RouterLink>
                  <TaskLabelPill v-if="task.label" :label="task.label" data-testid="task-label" />
                </div>
                <p class="mt-1 text-xs text-muted-foreground" data-testid="task-meta">
                  {{ task.createdBy.name }} が
                  <RelativeTime :datetime="task.createdAt" />
                  に作成<template v-if="taskPeriod(task)">
                    ·
                    <span
                      :class="dueStateClass(task.endDate, task.status)"
                      data-testid="task-period"
                      >{{ taskPeriod(task) }}</span
                    ></template
                  ><template v-if="task.archivedAt !== null"> · アーカイブ済み</template>
                </p>
              </div>
              <UserAvatar
                v-if="task.assignee"
                :user-id="task.assignee.id"
                :name="task.assignee.name"
                :avatar-url="task.assignee.avatarUrl"
                :size="20"
                :title="task.assignee.name"
                data-testid="task-assignee"
              />
            </li>
          </ul>
        </div>
      </section>
    </template>
  </div>
</template>
