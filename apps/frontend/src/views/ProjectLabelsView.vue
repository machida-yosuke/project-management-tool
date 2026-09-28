<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { canEdit } from '@pm-tool/shared';
import {
  getListLabelsQueryKey,
  useDeleteLabel,
  useGetProject,
  useListLabels,
} from '../api/generated';
import type { TaskLabel } from '../api/generated/models';
import LabelFormDialog from '../components/label/LabelFormDialog.vue';
import EmptyState from '../components/layout/EmptyState.vue';
import ProjectHeader from '../components/layout/ProjectHeader.vue';
import TaskLabelPill from '../components/task/TaskLabelPill.vue';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { Button, buttonVariants } from '../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { ApiRequestError, errorMessage } from '../lib/api';
import { listTasksKeyPrefix, useInvalidate } from '../lib/query';

const destructiveClass = buttonVariants({ variant: 'destructive' });

const route = useRoute();
const invalidate = useInvalidate();

const projectId = computed(() => String(route.params.projectId));
const projectQuery = useGetProject(projectId);
const labelsQuery = useListLabels(projectId);

const project = computed(() => projectQuery.data.value ?? null);
const labels = computed(() => labelsQuery.data.value ?? []);
const editable = computed(() => (project.value ? canEdit(project.value.role) : false));

const loadError = computed(() => {
  const e = projectQuery.error.value ?? labelsQuery.error.value ?? null;
  if (!e) return '';
  // Non-members get 404 so the project's existence is not leaked.
  return e instanceof ApiRequestError && e.status === 404
    ? 'プロジェクトが見つかりません'
    : errorMessage(e, {}, 'ラベルの読み込みに失敗しました');
});

const actionError = ref('');
const formOpen = ref(false);
const editingLabel = ref<TaskLabel | null>(null);

function openCreate() {
  editingLabel.value = null;
  formOpen.value = true;
}

function openEdit(label: TaskLabel) {
  editingLabel.value = label;
  formOpen.value = true;
}

// Deleting a label detaches it from its tasks, so their cached copies must refetch.
const { mutateAsync: deleteLabelRequest } = useDeleteLabel({
  mutation: {
    onSuccess: (_, vars) =>
      invalidate(getListLabelsQueryKey(vars.projectId), listTasksKeyPrefix(vars.projectId)),
  },
});

async function deleteLabel(label: TaskLabel) {
  actionError.value = '';
  try {
    await deleteLabelRequest({ projectId: projectId.value, labelId: label.id });
  } catch (e) {
    actionError.value = errorMessage(e, {}, '操作に失敗しました');
  }
}
</script>

<template>
  <div>
    <p v-if="loadError" class="my-4 text-destructive" role="alert">{{ loadError }}</p>
    <template v-if="project">
      <ProjectHeader :project="project" />
      <p v-if="actionError" class="mb-4 text-sm text-destructive" role="alert">
        {{ actionError }}
      </p>

      <section>
        <div class="mb-3 flex items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">ラベル</h2>
          <Button v-if="editable" type="button" size="sm" @click="openCreate">
            ラベルを作成
          </Button>
        </div>
        <EmptyState v-if="labels.length === 0" message="ラベルはありません" />
        <div v-else class="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow class="hover:bg-transparent">
                <TableHead class="px-4">ラベル</TableHead>
                <TableHead class="px-4">色</TableHead>
                <TableHead v-if="editable" class="px-4">
                  <span class="sr-only">操作</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="label in labels"
                :key="label.id"
                class="last:border-b-0"
                data-testid="label"
              >
                <TableCell class="px-4 py-3">
                  <TaskLabelPill :label="label" />
                </TableCell>
                <TableCell class="px-4 py-3 text-muted-foreground" data-testid="label-color">
                  <code class="font-mono text-xs">{{ label.color }}</code>
                </TableCell>
                <TableCell v-if="editable" class="px-4 py-3 text-right">
                  <div class="flex justify-end gap-1">
                    <Button type="button" variant="ghost" size="sm" @click="openEdit(label)">
                      編集
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger as-child>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          class="text-destructive hover:text-destructive"
                        >
                          削除
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>ラベルを削除</AlertDialogTitle>
                          <AlertDialogDescription>
                            「{{
                              label.name
                            }}」を削除します。このラベルが付いているタスクはラベルなしになります。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>キャンセル</AlertDialogCancel>
                          <AlertDialogAction :class="destructiveClass" @click="deleteLabel(label)">
                            削除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      <LabelFormDialog
        v-if="editable"
        v-model:open="formOpen"
        :project-id="projectId"
        :label="editingLabel"
      />
    </template>
  </div>
</template>
