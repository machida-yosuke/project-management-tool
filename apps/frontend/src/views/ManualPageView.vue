<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { canEdit, isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import {
  getGetManualPageQueryKey,
  useDeleteManualPage,
  useGetManualPage,
  useGetProject,
  useUpdateManualPage,
} from '../api/generated';
import type { UpdateManualPageRequest } from '../api/generated/models';
import EmptyState from '../components/layout/EmptyState.vue';
import ProjectHeader from '../components/layout/ProjectHeader.vue';
import ProjectNotFound from '../components/layout/ProjectNotFound.vue';
import RichTextContent from '../components/rich-text/RichTextContent.vue';
import RichTextForm from '../components/rich-text/RichTextForm.vue';
import RelativeTime from '../components/task/RelativeTime.vue';
import SidebarSection from '../components/task/SidebarSection.vue';
import TimelineItem from '../components/task/TimelineItem.vue';
import EditableTitle from '../components/EditableTitle.vue';
import UserAvatar from '../components/UserAvatar.vue';
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
import { ApiRequestError, errorMessage } from '../lib/api';
import { draftKeys } from '../lib/drafts';
import { listManualPagesKeyPrefix, useInvalidate } from '../lib/query';

const TITLE_ERRORS = { validation_error: 'タイトルは1〜200文字で入力してください' };
const BODY_ERRORS = { validation_error: '本文が大きすぎるか、形式が正しくありません' };
const destructiveClass = buttonVariants({ variant: 'destructive' });

const route = useRoute();
const router = useRouter();
const invalidate = useInvalidate();

const projectId = computed(() => String(route.params.projectId));
const manualId = computed(() => String(route.params.manualId));

const projectQuery = useGetProject(projectId);
const manualQuery = useGetManualPage(projectId, manualId);

const project = computed(() => projectQuery.data.value ?? null);
const manual = computed(() => manualQuery.data.value ?? null);
const editable = computed(() => (project.value ? canEdit(project.value.role) : false));

function isNotFound(e: unknown) {
  return e instanceof ApiRequestError && e.status === 404;
}

const projectNotFound = computed(() => isNotFound(projectQuery.error.value));
const manualMissing = computed(() => !projectNotFound.value && isNotFound(manualQuery.error.value));
const loadError = computed(() => {
  const e = projectQuery.error.value ?? manualQuery.error.value;
  if (!e || projectNotFound.value || manualMissing.value) return '';
  return errorMessage(e, {}, 'マニュアルの読み込みに失敗しました');
});

const editingBody = ref(false);
const actionError = ref('');

watch([projectId, manualId], () => {
  editingBody.value = false;
  actionError.value = '';
});

const updateManualMutation = useUpdateManualPage({
  mutation: {
    onSuccess: (_, vars) =>
      invalidate(
        getGetManualPageQueryKey(vars.projectId, vars.manualId),
        listManualPagesKeyPrefix(vars.projectId),
      ),
  },
});

function updateManual(updateManualPageRequest: UpdateManualPageRequest) {
  return updateManualMutation.mutateAsync({
    projectId: projectId.value,
    manualId: manualId.value,
    updateManualPageRequest,
  });
}

function saveTitle(title: string) {
  return updateManual({ title });
}

function saveBody(body: RichTextDoc) {
  return updateManual({ body });
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('ja-JP');
}

const deleteManualMutation = useDeleteManualPage({
  mutation: { onSuccess: (_, vars) => invalidate(listManualPagesKeyPrefix(vars.projectId)) },
});

async function deleteManual() {
  actionError.value = '';
  try {
    await deleteManualMutation.mutateAsync({
      projectId: projectId.value,
      manualId: manualId.value,
    });
  } catch (e) {
    actionError.value = errorMessage(e, {}, '操作に失敗しました');
    return;
  }
  await router.push({ name: 'project-manuals', params: { projectId: projectId.value } });
}
</script>

<template>
  <div>
    <ProjectNotFound v-if="projectNotFound" />
    <p v-if="loadError" class="my-4 text-destructive" role="alert">{{ loadError }}</p>
    <template v-if="project">
      <ProjectHeader :project="project" />
      <Button variant="link" size="sm" class="mb-4 px-0" as-child>
        <RouterLink
          :to="{ name: 'project-manuals', params: { projectId } }"
          data-testid="back-to-manuals"
        >
          ← マニュアル一覧
        </RouterLink>
      </Button>
      <p v-if="actionError" class="mb-4 text-destructive" role="alert">{{ actionError }}</p>

      <EmptyState v-if="manualMissing" message="マニュアルが見つかりません">
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: 'project-manuals', params: { projectId } }"
            >マニュアル一覧へ戻る</RouterLink
          >
        </Button>
      </EmptyState>

      <article v-else-if="manual" :key="manual.id" data-testid="manual-page">
        <div class="mb-6 space-y-3 border-b pb-4" data-testid="manual-header">
          <EditableTitle
            data-testid="manual-title-form"
            :title="manual.title"
            :editable="editable"
            :save="saveTitle"
            :error-messages="TITLE_ERRORS"
          />
          <p class="text-sm text-muted-foreground" data-testid="manual-meta">
            <span class="font-semibold text-foreground">{{ manual.createdBy.name }}</span>
            が <RelativeTime :datetime="manual.createdAt" />に作成
          </p>
        </div>

        <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div class="min-w-0">
            <TimelineItem :author="manual.createdBy" :created-at="manual.createdAt">
              <template #meta>
                <span
                  v-if="manual.updatedAt !== manual.createdAt"
                  class="text-muted-foreground"
                  data-testid="manual-edited"
                  :title="formatTimestamp(manual.updatedAt)"
                >
                  編集済み
                </span>
              </template>
              <template #actions>
                <Button
                  v-if="editable && !editingBody"
                  type="button"
                  variant="ghost"
                  size="sm"
                  @click="editingBody = true"
                >
                  編集
                </Button>
              </template>
              <RichTextForm
                v-if="editingBody"
                data-testid="edit-manual"
                :project-id="projectId"
                :draft-key="draftKeys.manual(manual.id)"
                :initial-doc="manual.body"
                label="本文"
                placeholder="本文を書く"
                submit-label="保存"
                cancelable
                :error-messages="BODY_ERRORS"
                :submit="saveBody"
                @submitted="editingBody = false"
                @cancel="editingBody = false"
              />
              <RichTextContent
                v-else-if="!isRichTextDocEmpty(manual.body)"
                data-testid="manual-body"
                :doc="manual.body"
              />
              <p v-else class="text-sm text-muted-foreground italic">本文はありません</p>
            </TimelineItem>
          </div>

          <aside
            class="order-first grid grid-cols-2 gap-x-6 text-sm lg:order-none lg:block"
            data-testid="manual-sidebar"
          >
            <SidebarSection title="作成者">
              <p class="flex items-center gap-1.5">
                <UserAvatar
                  :user-id="manual.createdBy.id"
                  :name="manual.createdBy.name"
                  :avatar-url="manual.createdBy.avatarUrl"
                  :size="20"
                />
                <span data-testid="manual-created-by">{{ manual.createdBy.name }}</span>
              </p>
            </SidebarSection>

            <SidebarSection title="更新日時">
              <span data-testid="manual-updated-at">{{ formatTimestamp(manual.updatedAt) }}</span>
            </SidebarSection>

            <SidebarSection v-if="editable" class="col-span-2 lg:col-span-1" title="削除">
              <div class="flex flex-wrap items-center justify-end gap-2">
                <AlertDialog>
                  <AlertDialogTrigger as-child>
                    <Button type="button" variant="destructive" size="sm">削除</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>ページを削除</AlertDialogTitle>
                      <AlertDialogDescription>
                        「{{ manual.title }}」を削除します。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>キャンセル</AlertDialogCancel>
                      <AlertDialogAction :class="destructiveClass" @click="deleteManual">
                        削除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </SidebarSection>
          </aside>
        </div>
      </article>
    </template>
  </div>
</template>
