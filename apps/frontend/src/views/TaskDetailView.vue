<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useQueryCache } from '@pinia/colada';
import { canEdit } from '@pm-tool/shared';
import {
  useArchiveTask,
  useGetProject,
  useListComments,
  useListLabels,
  useListMembers,
  useListTasks,
  useUnarchiveTask,
  useUpdateTask,
} from '../api/generated';
import type { Task, TaskLabel, UpdateTaskRequest } from '../api/generated/models';
import CommentThread from '../components/CommentThread.vue';
import TaskDescription from '../components/TaskDescription.vue';
import TaskTitle from '../components/TaskTitle.vue';
import UserAvatar from '../components/UserAvatar.vue';
import LabelFormDialog from '../components/label/LabelFormDialog.vue';
import EmptyState from '../components/layout/EmptyState.vue';
import ProjectHeader from '../components/layout/ProjectHeader.vue';
import RelativeTime from '../components/task/RelativeTime.vue';
import SidebarSection from '../components/task/SidebarSection.vue';
import TaskLabelPill from '../components/task/TaskLabelPill.vue';
import TaskStateBadge from '../components/task/TaskStateBadge.vue';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { ApiRequestError, errorMessage } from '../lib/api';
import { eventValue } from '../lib/form';
import { dueStateClass } from '../lib/due-state';
import { listTasksKeyPrefix, patchCachedTasks, useInvalidate } from '../lib/query';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const invalidate = useInvalidate();
const queryCache = useQueryCache();
const authStore = useAuthStore();

const projectId = computed(() => String(route.params.projectId));
const taskId = computed(() => String(route.params.taskId));

const projectQuery = useGetProject(projectId);
// There is no single-task endpoint; archived tasks must stay reachable from their own page.
const tasksQuery = useListTasks(projectId, () => ({ includeArchived: true }));
const membersQuery = useListMembers(projectId);

const task = computed(
  () => tasksQuery.data.value?.find((candidate) => candidate.id === taskId.value) ?? null,
);
const commentsQuery = useListComments(projectId, taskId, () => ({
  query: { enabled: task.value !== null },
}));

const project = computed(() => projectQuery.data.value ?? null);
const members = computed(() => membersQuery.data.value ?? []);
const comments = computed(() => commentsQuery.data.value ?? []);
const taskMissing = computed(() => tasksQuery.data.value !== undefined && task.value === null);
const editable = computed(() => (project.value ? canEdit(project.value.role) : false));
// Labels only feed the edit select, so read-only roles skip the request.
const labelsQuery = useListLabels(projectId, () => ({ query: { enabled: editable.value } }));
const labels = computed(() => labelsQuery.data.value ?? []);

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

watch([projectId, taskId], () => {
  actionError.value = '';
});

function invalidateTasks() {
  return invalidate(listTasksKeyPrefix(projectId.value));
}

// Fields that cannot be resolved locally (e.g. a label not loaded yet) keep their value until the refetch.
function applyUpdate(current: Task, request: UpdateTaskRequest): Task {
  const next = { ...current };
  if (request.status !== undefined) next.status = request.status;
  if (request.startDate !== undefined) next.startDate = request.startDate;
  if (request.endDate !== undefined) next.endDate = request.endDate;
  if (request.assigneeId === null) {
    next.assignee = null;
  } else if (request.assigneeId !== undefined) {
    const member = members.value.find((candidate) => candidate.userId === request.assigneeId);
    if (member) {
      next.assignee = {
        id: member.userId,
        email: member.email,
        name: member.name,
        avatarUrl: member.avatarUrl,
      };
    }
  }
  if (request.labelId === null) {
    next.label = null;
  } else if (request.labelId !== undefined) {
    next.label = labels.value.find((candidate) => candidate.id === request.labelId) ?? next.label;
  }
  return next;
}

const updateTaskMutation = useUpdateTask({
  mutation: {
    onMutate: (vars) => ({
      rollback: patchCachedTasks(queryCache, vars.projectId, vars.taskId, (current) =>
        applyUpdate(current, vars.updateTaskRequest),
      ),
    }),
    onError: (_error, _vars, context) => {
      context.rollback?.();
    },
    onSettled: (_data, _error, vars) => invalidate(listTasksKeyPrefix(vars.projectId)),
  },
});
const archiveTaskMutation = useArchiveTask({ mutation: { onSuccess: invalidateTasks } });
const unarchiveTaskMutation = useUnarchiveTask({ mutation: { onSuccess: invalidateTasks } });

async function runAction(action: () => Promise<unknown>, messages: Record<string, string> = {}) {
  actionError.value = '';
  try {
    await action();
  } catch (e) {
    actionError.value = errorMessage(e, messages, '操作に失敗しました');
  }
}

// Reka UI's SelectItem rejects an empty-string value, so "unassigned" needs its own token.
const UNASSIGNED = '__unassigned__';
const NO_LABEL = '__no_label__';
const CREATE_LABEL = '__create_label__';

const createLabelOpen = ref(false);

function updateTask(target: Task, request: UpdateTaskRequest, messages?: Record<string, string>) {
  return runAction(
    () =>
      updateTaskMutation.mutateAsync({
        projectId: projectId.value,
        taskId: target.id,
        updateTaskRequest: request,
      }),
    messages,
  );
}

function toggleDone(target: Task) {
  return updateTask(target, { status: target.status === 'done' ? 'open' : 'done' });
}

function assign(target: Task, value: unknown) {
  if (typeof value !== 'string') throw new Error(`Unknown assignee: ${String(value)}`);
  return updateTask(
    target,
    { assigneeId: value === UNASSIGNED ? null : value },
    { assignee_not_member: '担当者はプロジェクトメンバーから選んでください' },
  );
}

function changeDate(target: Task, field: 'startDate' | 'endDate', event: Event) {
  const value = eventValue(event);
  let range: Pick<UpdateTaskRequest, 'startDate' | 'endDate'>;
  if (value === '') {
    range = { startDate: null, endDate: null };
  } else if (field === 'startDate') {
    range = { startDate: value, endDate: target.endDate ?? value };
  } else {
    range = { startDate: target.startDate ?? value, endDate: value };
  }
  return updateTask(target, range, { invalid_date_range: '終了日は開始日以降にしてください' });
}

function changeLabel(target: Task, value: unknown) {
  if (value === CREATE_LABEL) {
    createLabelOpen.value = true;
    return;
  }
  if (value === NO_LABEL) return updateTask(target, { labelId: null });
  const label = labels.value.find((candidate) => candidate.id === value);
  if (!label) throw new Error(`Unknown label: ${String(value)}`);
  return updateTask(target, { labelId: label.id });
}

function applyCreatedLabel(target: Task, label: TaskLabel) {
  return updateTask(target, { labelId: label.id });
}

function archiveTask(target: Task) {
  return runAction(() =>
    archiveTaskMutation.mutateAsync({ projectId: projectId.value, taskId: target.id }),
  );
}

function unarchiveTask(target: Task) {
  return runAction(() =>
    unarchiveTaskMutation.mutateAsync({ projectId: projectId.value, taskId: target.id }),
  );
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('ja-JP');
}
</script>

<template>
  <div>
    <p v-if="loadError" class="my-4 text-destructive" role="alert">{{ loadError }}</p>
    <template v-if="project">
      <ProjectHeader :project="project" />
      <Button variant="link" size="sm" class="mb-4 px-0" as-child>
        <RouterLink
          :to="{ name: 'project-tasks', params: { projectId } }"
          data-testid="back-to-tasks"
        >
          ← タスク一覧
        </RouterLink>
      </Button>
      <p v-if="actionError" class="mb-4 text-destructive" role="alert">{{ actionError }}</p>

      <EmptyState v-if="taskMissing" message="タスクが見つかりません">
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: 'project-tasks', params: { projectId } }"
            >タスク一覧へ戻る</RouterLink
          >
        </Button>
      </EmptyState>

      <template v-else-if="task">
        <div class="mb-6 space-y-3 border-b pb-4" data-testid="task-header">
          <TaskTitle :key="task.id" :task="task" :editable="editable" />
          <div class="flex flex-wrap items-center gap-2">
            <TaskStateBadge :status="task.status" data-testid="task-status" />
            <Badge v-if="task.archivedAt !== null" variant="outline">アーカイブ済み</Badge>
            <p class="text-sm text-muted-foreground">
              <span class="font-semibold text-foreground">{{ task.createdBy.name }}</span>
              が <RelativeTime :datetime="task.createdAt" />に作成 · コメント
              {{ comments.length }} 件
            </p>
          </div>
        </div>

        <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div class="min-w-0 space-y-4" data-testid="task-timeline">
            <TaskDescription :key="task.id" :task="task" :editable="editable" />
            <CommentThread
              :key="task.id"
              :project-id="projectId"
              :task-id="task.id"
              :comments="comments"
              :comments-error="commentsError"
              :editable="editable"
              :current-user-id="authStore.user?.id ?? null"
            >
              <template #form-actions>
                <Button type="button" variant="outline" size="sm" @click="toggleDone(task)">
                  {{ task.status === 'done' ? '未完了に戻す' : '完了にする' }}
                </Button>
              </template>
            </CommentThread>
          </div>

          <aside
            class="order-first grid grid-cols-2 gap-x-6 text-sm lg:order-none lg:block"
            data-testid="task-sidebar"
          >
            <SidebarSection title="担当者">
              <Select
                v-if="editable"
                :model-value="task.assignee?.id ?? UNASSIGNED"
                @update:model-value="assign(task, $event)"
              >
                <SelectTrigger size="sm" class="w-full" aria-label="担当者">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="UNASSIGNED">未割り当て</SelectItem>
                  <SelectItem v-for="member in members" :key="member.userId" :value="member.userId">
                    {{ member.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p v-else class="flex items-center gap-1.5">
                <UserAvatar
                  v-if="task.assignee"
                  :user-id="task.assignee.id"
                  :name="task.assignee.name"
                  :avatar-url="task.assignee.avatarUrl"
                  :size="20"
                />
                <span
                  :class="{ 'text-muted-foreground': !task.assignee }"
                  data-testid="task-assignee"
                >
                  {{ task.assignee?.name ?? '未割り当て' }}
                </span>
              </p>
            </SidebarSection>

            <SidebarSection title="ラベル">
              <template v-if="editable">
                <Select
                  :model-value="task.label?.id ?? NO_LABEL"
                  @update:model-value="changeLabel(task, $event)"
                >
                  <SelectTrigger size="sm" class="w-full" aria-label="ラベル">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="NO_LABEL">なし</SelectItem>
                    <SelectItem v-for="label in labels" :key="label.id" :value="label.id">
                      <TaskLabelPill :label="label" />
                    </SelectItem>
                    <SelectSeparator />
                    <SelectItem :value="CREATE_LABEL">新しいラベルを作成…</SelectItem>
                  </SelectContent>
                </Select>
                <LabelFormDialog
                  v-model:open="createLabelOpen"
                  :project-id="projectId"
                  @saved="applyCreatedLabel(task, $event)"
                />
              </template>
              <TaskLabelPill v-else-if="task.label" :label="task.label" data-testid="task-label" />
              <p v-else class="text-muted-foreground" data-testid="task-label">なし</p>
            </SidebarSection>

            <SidebarSection class="col-span-2 lg:col-span-1" title="期間">
              <div v-if="editable" class="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5">
                <label for="task-start-date" class="text-muted-foreground">開始</label>
                <Input
                  id="task-start-date"
                  type="date"
                  class="h-8"
                  aria-label="開始日"
                  :model-value="task.startDate ?? ''"
                  @change="changeDate(task, 'startDate', $event)"
                />
                <label for="task-end-date" class="text-muted-foreground">終了</label>
                <Input
                  id="task-end-date"
                  type="date"
                  class="h-8"
                  :class="dueStateClass(task.endDate, task.status)"
                  aria-label="終了日"
                  :model-value="task.endDate ?? ''"
                  @change="changeDate(task, 'endDate', $event)"
                />
              </div>
              <dl v-else class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                <dt class="text-muted-foreground">開始</dt>
                <dd
                  :class="{ 'text-muted-foreground': !task.startDate }"
                  data-testid="task-start-date"
                >
                  {{ task.startDate ?? '未設定' }}
                </dd>
                <dt class="text-muted-foreground">終了</dt>
                <dd
                  :class="
                    task.endDate
                      ? dueStateClass(task.endDate, task.status)
                      : 'text-muted-foreground'
                  "
                  data-testid="task-end-date"
                >
                  {{ task.endDate ?? '未設定' }}
                </dd>
              </dl>
            </SidebarSection>

            <SidebarSection title="作成者">
              <p class="flex items-center gap-1.5">
                <UserAvatar
                  :user-id="task.createdBy.id"
                  :name="task.createdBy.name"
                  :avatar-url="task.createdBy.avatarUrl"
                  :size="20"
                />
                <span data-testid="task-created-by">{{ task.createdBy.name }}</span>
              </p>
            </SidebarSection>

            <SidebarSection
              v-if="editable || task.archivedAt !== null"
              class="col-span-2 lg:col-span-1"
              title="アーカイブ"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span v-if="task.archivedAt !== null" data-testid="task-archived-at">
                  {{ formatTimestamp(task.archivedAt) }}
                </span>
                <span v-else class="text-muted-foreground">未アーカイブ</span>
                <template v-if="editable">
                  <Button
                    v-if="task.archivedAt === null"
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="archiveTask(task)"
                  >
                    アーカイブ
                  </Button>
                  <Button
                    v-else
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="unarchiveTask(task)"
                  >
                    復元
                  </Button>
                </template>
              </div>
            </SidebarSection>
          </aside>
        </div>
      </template>
    </template>
  </div>
</template>
