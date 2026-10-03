<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { canEdit, isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import { CircleCheck, CircleDot, Pencil } from '@lucide/vue';
import {
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  useArchiveProject,
  useUnarchiveProject,
  useUpdateProject,
} from '../../api/generated';
import type { Project, ProjectMember, Task } from '../../api/generated/models';
import UserAvatar from '../UserAvatar.vue';
import RichTextContent from '../rich-text/RichTextContent.vue';
import RichTextForm from '../rich-text/RichTextForm.vue';
import RelativeTime from '../task/RelativeTime.vue';
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
import { Card, CardAction, CardContent, CardHeader } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { errorMessage } from '../../lib/api';
import { draftKeys } from '../../lib/drafts';
import { PROJECT_DONE_HELP } from '../../lib/help-texts';
import { useInvalidate } from '../../lib/query';

const MEMBER_AVATAR_LIMIT = 5;

const props = defineProps<{ project: Project; members?: ProjectMember[]; tasks?: Task[] }>();

const invalidate = useInvalidate();

const editable = computed(() => canEdit(props.project.role));
const archivable = computed(() => props.project.role === 'admin');
const archived = computed(() => props.project.archivedAt !== null);
const hasDescription = computed(() => !isRichTextDocEmpty(props.project.description));

const shownMembers = computed(() => props.members?.slice(0, MEMBER_AVATAR_LIMIT) ?? []);
const hiddenMemberCount = computed(() =>
  Math.max(0, (props.members?.length ?? 0) - MEMBER_AVATAR_LIMIT),
);

const taskCounts = computed(() => {
  if (!props.tasks) return null;
  const active = props.tasks.filter((task) => task.archivedAt === null);
  const done = active.filter((task) => task.status === 'done').length;
  return { open: active.length - done, done };
});

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
  <Card class="mb-8 min-w-0 gap-0">
    <CardHeader>
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <h1 class="min-w-0 text-2xl font-semibold tracking-tight wrap-anywhere">
          {{ project.name }}
        </h1>
        <Badge v-if="archived" variant="secondary" data-testid="project-archived">完了</Badge>
      </div>
      <div
        class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground"
        data-testid="project-meta"
      >
        <span data-testid="project-created-at"
          ><RelativeTime :datetime="project.createdAt" />に作成</span
        >
        <RouterLink
          v-if="members"
          :to="{ name: 'project-members', params: { projectId: project.id } }"
          class="inline-flex items-center gap-2 hover:text-primary hover:underline"
          data-testid="project-members-link"
        >
          <span class="flex -space-x-2" aria-hidden="true">
            <UserAvatar
              v-for="member in shownMembers"
              :key="member.userId"
              class="ring-2 ring-background"
              :user-id="member.userId"
              :name="member.name"
              :avatar-url="member.avatarUrl"
              :size="20"
              data-testid="project-member-avatar"
            />
            <span
              v-if="hiddenMemberCount > 0"
              class="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] leading-none font-semibold text-muted-foreground ring-2 ring-background"
              data-testid="project-member-more"
              >+{{ hiddenMemberCount }}</span
            >
          </span>
          <span data-testid="project-member-count">メンバー {{ members.length }} 人</span>
        </RouterLink>
        <template v-if="taskCounts">
          <RouterLink
            :to="{ name: 'project-tasks', params: { projectId: project.id } }"
            class="inline-flex items-center gap-1 hover:text-primary hover:underline"
            data-testid="project-open-tasks"
          >
            <CircleDot class="size-4 flex-none text-success" aria-hidden="true" />
            未完了 {{ taskCounts.open }}
          </RouterLink>
          <RouterLink
            :to="{ name: 'project-tasks', params: { projectId: project.id } }"
            class="inline-flex items-center gap-1 hover:text-primary hover:underline"
            data-testid="project-done-tasks"
          >
            <CircleCheck class="size-4 flex-none text-info" aria-hidden="true" />
            完了 {{ taskCounts.done }}
          </RouterLink>
        </template>
      </div>
      <CardAction v-if="editable" class="shrink-0">
        <Dialog v-model:open="editOpen">
          <DialogTrigger as-child>
            <Button type="button" variant="outline" size="sm" aria-label="プロジェクトを編集">
              <Pencil aria-hidden="true" />
              編集
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
      </CardAction>
    </CardHeader>
    <CardContent v-if="hasDescription || editable" class="mt-4 border-t pt-4">
      <RichTextContent
        v-if="hasDescription"
        class="text-sm"
        data-testid="project-description"
        :doc="project.description"
      />
      <p
        v-else
        class="text-sm text-muted-foreground italic"
        data-testid="project-description-empty"
      >
        説明はありません
      </p>
    </CardContent>
  </Card>
</template>
