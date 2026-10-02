<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { emptyRichTextDoc, richTextDocToPlainText, type RichTextDoc } from '@pm-tool/shared';
import {
  getListMyInvitationsQueryKey,
  getListProjectsQueryKey,
  useAcceptInvitation,
  useCreateProject,
  useListMyInvitations,
  useListProjects,
} from '../api/generated';
import UserAvatar from '../components/UserAvatar.vue';
import EmptyState from '../components/layout/EmptyState.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import RichTextForm from '../components/rich-text/RichTextForm.vue';
import { errorMessage } from '../lib/api';
import { draftKeys } from '../lib/drafts';
import { useInvalidate } from '../lib/query';
import { ROLE_LABELS } from '../lib/roles';

const router = useRouter();
const invalidate = useInvalidate();

const { data: projects, error: projectsError } = useListProjects();
const { data: invitations, error: invitationsError } = useListMyInvitations();

const loadError = computed(() => {
  const e = projectsError.value ?? invitationsError.value;
  return e ? errorMessage(e, {}, '読み込みに失敗しました') : '';
});

const { mutateAsync: createProjectMutation } = useCreateProject({
  mutation: { onSuccess: () => invalidate(getListProjectsQueryKey()) },
});
const { mutateAsync: acceptInvitationMutation } = useAcceptInvitation({
  mutation: {
    onSuccess: () => invalidate(getListProjectsQueryKey(), getListMyInvitationsQueryKey()),
  },
});

const newName = ref('');
const createOpen = ref(false);
const creatingProject = ref(false);
const passcodes = reactive<Record<string, string>>({});
const acceptErrors = reactive<Record<string, string>>({});
const accepting = ref<string | null>(null);

const CREATE_PROJECT_ERRORS = { validation_error: 'プロジェクト名は1〜200文字で入力してください' };

async function createProject(description: RichTextDoc) {
  creatingProject.value = true;
  try {
    await createProjectMutation({
      createProjectRequest: { name: newName.value.trim(), description },
    });
    newName.value = '';
  } finally {
    creatingProject.value = false;
  }
}

function onCreateInteractOutside(event: Event) {
  if (creatingProject.value) event.preventDefault();
}

async function acceptInvitation(invitationId: string) {
  acceptErrors[invitationId] = '';
  accepting.value = invitationId;
  try {
    const project = await acceptInvitationMutation({
      invitationId,
      acceptInvitationRequest: { passcode: passcodes[invitationId] ?? '' },
    });
    await router.push({ name: 'project', params: { projectId: project.id } });
  } catch (e) {
    acceptErrors[invitationId] = errorMessage(
      e,
      {
        invalid_passcode: '暗証番号が違います',
        locked: '暗証番号の入力回数が上限に達しました。管理者に再招待を依頼してください',
        expired: '招待の有効期限が切れています。管理者に再招待を依頼してください',
        validation_error: '暗証番号は4〜32文字で入力してください',
      },
      '招待の受諾に失敗しました',
    );
  } finally {
    accepting.value = null;
  }
}
</script>

<template>
  <div>
    <PageHeader title="ホーム" description="参加しているプロジェクトと、届いている招待を確認する。">
      <template #actions>
        <Dialog v-model:open="createOpen">
          <DialogTrigger as-child>
            <Button type="button">プロジェクトを作成</Button>
          </DialogTrigger>
          <DialogContent class="sm:max-w-2xl" @interact-outside="onCreateInteractOutside">
            <DialogHeader>
              <DialogTitle>プロジェクトを作成</DialogTitle>
            </DialogHeader>
            <RichTextForm
              class="flex flex-col gap-4"
              data-testid="create-project"
              :project-id="null"
              :draft-key="draftKeys.newProject()"
              :initial-doc="emptyRichTextDoc()"
              label="プロジェクトの説明"
              placeholder="説明（任意）"
              submit-label="作成"
              allow-empty
              :error-messages="CREATE_PROJECT_ERRORS"
              submit-error-fallback="プロジェクトの作成に失敗しました"
              :submit="createProject"
              @submitted="createOpen = false"
            >
              <div class="flex flex-col gap-2">
                <Label for="new-project-name">プロジェクト名</Label>
                <Input
                  id="new-project-name"
                  v-model="newName"
                  type="text"
                  placeholder="プロジェクト名"
                  required
                  maxlength="200"
                  aria-label="プロジェクト名"
                />
              </div>
            </RichTextForm>
          </DialogContent>
        </Dialog>
      </template>
    </PageHeader>

    <div class="space-y-8">
      <Alert v-if="loadError" variant="destructive">
        <AlertDescription>{{ loadError }}</AlertDescription>
      </Alert>

      <section v-if="invitations && invitations.length > 0" data-testid="invitations">
        <h2 class="mb-3 text-lg font-semibold">届いている招待</h2>
        <ul class="space-y-3">
          <li v-for="invitation in invitations" :key="invitation.id" data-testid="invitation">
            <Card class="gap-4 py-4">
              <CardHeader
                class="px-4 has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]"
              >
                <CardTitle class="flex flex-wrap items-center gap-2">
                  {{ invitation.projectName }}
                  <Badge variant="warning">{{ ROLE_LABELS[invitation.role] }}</Badge>
                </CardTitle>
                <CardDescription class="flex items-center gap-1">
                  招待者:
                  <UserAvatar
                    :user-id="invitation.invitedBy.id"
                    :name="invitation.invitedBy.name"
                    :avatar-url="invitation.invitedBy.avatarUrl"
                    :size="20"
                  />
                  {{ invitation.invitedBy.name }}
                </CardDescription>
                <CardAction
                  class="col-start-auto row-span-1 row-start-auto justify-self-stretch sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end"
                >
                  <form
                    class="flex flex-wrap gap-2"
                    @submit.prevent="acceptInvitation(invitation.id)"
                  >
                    <Input
                      v-model="passcodes[invitation.id]"
                      class="w-40"
                      type="password"
                      placeholder="暗証番号"
                      required
                      minlength="4"
                      maxlength="32"
                      aria-label="暗証番号"
                    />
                    <Button type="submit" :disabled="accepting === invitation.id">受諾</Button>
                  </form>
                </CardAction>
              </CardHeader>
              <CardContent v-if="acceptErrors[invitation.id]" class="px-4">
                <Alert variant="destructive">
                  <AlertDescription>{{ acceptErrors[invitation.id] }}</AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </li>
        </ul>
      </section>

      <section>
        <h2 class="mb-3 text-lg font-semibold">プロジェクト</h2>
        <EmptyState
          v-if="!projects || projects.length === 0"
          message="参加しているプロジェクトはありません"
        />
        <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="projects">
          <li v-for="project in projects" :key="project.id">
            <router-link
              :to="{ name: 'project', params: { projectId: project.id } }"
              class="group block h-full rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Card class="h-full gap-2 py-4 transition-colors group-hover:bg-muted/50">
                <CardHeader class="px-4">
                  <CardTitle class="truncate">{{ project.name }}</CardTitle>
                  <CardAction>
                    <Badge variant="info">{{ ROLE_LABELS[project.role] }}</Badge>
                  </CardAction>
                </CardHeader>
                <CardContent class="px-4">
                  <p class="line-clamp-2 text-sm text-muted-foreground">
                    {{ richTextDocToPlainText(project.description) || '説明はありません' }}
                  </p>
                </CardContent>
              </Card>
            </router-link>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
