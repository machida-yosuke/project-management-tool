<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { canEdit, isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import { Pencil } from '@lucide/vue';
import {
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  useArchiveProject,
  useUnarchiveProject,
  useUpdateProject,
} from '../../api/generated';
import type { Project } from '../../api/generated/models';
import RichTextContent from '../rich-text/RichTextContent.vue';
import RichTextForm from '../rich-text/RichTextForm.vue';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { errorMessage } from '../../lib/api';
import { draftKeys } from '../../lib/drafts';
import { PROJECT_DONE_HELP } from '../../lib/help-texts';
import { useInvalidate } from '../../lib/query';

const props = defineProps<{ project: Project }>();

const invalidate = useInvalidate();

const editable = computed(() => canEdit(props.project.role));
const archivable = computed(() => props.project.role === 'admin');
const archived = computed(() => props.project.archivedAt !== null);

const editOpen = ref(false);
// Re-keys RichTextForm per open: it empties its doc after submit, and the draft should reload.
const editOpenCount = ref(0);
const editName = ref('');
const saving = ref(false);

watch(editOpen, (open) => {
  if (!open) return;
  editOpenCount.value += 1;
  editName.value = props.project.name;
});

watch(
  () => props.project.id,
  () => {
    editOpen.value = false;
  },
);

const updateProjectMutation = useUpdateProject({
  mutation: {
    onSuccess: (_, vars) =>
      invalidate(getGetProjectQueryKey(vars.projectId), getListProjectsQueryKey()),
  },
});

const EDIT_PROJECT_ERRORS = {
  validation_error: '名前は1〜200文字、説明は正しい形式で入力してください',
};

async function saveProject(description: RichTextDoc) {
  saving.value = true;
  try {
    await updateProjectMutation.mutateAsync({
      projectId: props.project.id,
      updateProjectRequest: { name: editName.value.trim(), description },
    });
  } finally {
    saving.value = false;
  }
}

const invalidateProject = (_: unknown, vars: { projectId: string }) =>
  invalidate(getGetProjectQueryKey(vars.projectId), getListProjectsQueryKey());
const archiveMutation = useArchiveProject({ mutation: { onSuccess: invalidateProject } });
const unarchiveMutation = useUnarchiveProject({ mutation: { onSuccess: invalidateProject } });
const archiving = ref(false);
const archiveError = ref('');
const archiveConfirmOpen = ref(false);

async function setArchived(next: boolean) {
  archiving.value = true;
  archiveError.value = '';
  try {
    const mutation = next ? archiveMutation : unarchiveMutation;
    await mutation.mutateAsync({ projectId: props.project.id });
    editOpen.value = false;
  } catch (e) {
    archiveError.value = errorMessage(e, {}, 'プロジェクトの状態の変更に失敗しました');
  } finally {
    archiving.value = false;
    archiveConfirmOpen.value = false;
  }
}

function preventWhileArchiving(event: Event) {
  if (archiving.value) event.preventDefault();
}

function onInteractOutside(event: Event) {
  if (saving.value || archiving.value) event.preventDefault();
}
</script>

<template>
  <div class="mb-8 min-w-0">
    <div class="flex min-w-0 items-center gap-2">
      <h1 class="min-w-0 truncate text-2xl font-semibold tracking-tight">{{ project.name }}</h1>
      <Badge v-if="archived" variant="secondary" data-testid="project-archived">完了</Badge>
      <Dialog v-if="editable" v-model:open="editOpen">
        <DialogTrigger as-child>
          <Button type="button" variant="ghost" size="icon" aria-label="プロジェクトを編集">
            <Pencil aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent class="sm:max-w-2xl" @interact-outside="onInteractOutside">
          <DialogHeader>
            <DialogTitle>プロジェクトを編集</DialogTitle>
          </DialogHeader>
          <RichTextForm
            :key="`${project.id}:${editOpenCount}`"
            data-testid="edit-project"
            :project-id="project.id"
            :draft-key="draftKeys.projectDescription(project.id)"
            :initial-doc="project.description"
            label="説明"
            placeholder="説明を書く"
            submit-label="保存"
            allow-empty
            :error-messages="EDIT_PROJECT_ERRORS"
            :submit="saveProject"
            @submitted="editOpen = false"
          >
            <Input
              v-model="editName"
              type="text"
              required
              maxlength="200"
              aria-label="プロジェクトの名前"
            />
          </RichTextForm>
          <div
            v-if="archivable"
            class="flex flex-wrap items-center justify-between gap-2 border-t pt-4"
            data-testid="project-archive-section"
          >
            <p class="text-sm text-muted-foreground">
              {{
                archived
                  ? 'このプロジェクトは完了しています。'
                  : '完了するとホームの「完了した案件」に移動します。'
              }}
            </p>
            <TooltipProvider v-if="archived">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    :disabled="archiving"
                    data-testid="toggle-archived"
                    @click="setArchived(false)"
                  >
                    進行中に戻す
                  </Button>
                </TooltipTrigger>
                <TooltipContent class="max-w-xs">{{ PROJECT_DONE_HELP }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <AlertDialog v-else v-model:open="archiveConfirmOpen">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <AlertDialogTrigger as-child>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        data-testid="toggle-archived"
                      >
                        完了にする
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent class="max-w-xs">{{ PROJECT_DONE_HELP }}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <AlertDialogContent
                @interact-outside="preventWhileArchiving"
                @escape-key-down="preventWhileArchiving"
              >
                <AlertDialogHeader>
                  <AlertDialogTitle>プロジェクトを完了にしますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    ホームの「完了したプロジェクト」に移動し、メンバーの「自分のタスク」からこのプロジェクトのタスクが外れます。あとから進行中に戻せます。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel :disabled="archiving">キャンセル</AlertDialogCancel>
                  <!-- A plain button, not AlertDialogAction, so the dialog stays open until the request settles. -->
                  <Button
                    type="button"
                    variant="destructive"
                    :disabled="archiving"
                    @click="setArchived(true)"
                  >
                    完了にする
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <p v-if="archiveError" class="w-full text-sm text-destructive" role="alert">
              {{ archiveError }}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    <RichTextContent
      v-if="!isRichTextDocEmpty(project.description)"
      class="mt-2 text-sm text-muted-foreground"
      data-testid="project-description"
      :doc="project.description"
    />
  </div>
</template>
