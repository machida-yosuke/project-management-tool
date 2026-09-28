<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { emptyRichTextDoc, type RichTextDoc } from '@pm-tool/shared';
import {
  getListMyInvitationsQueryKey,
  getListProjectsQueryKey,
  useAcceptInvitation,
  useCreateProject,
  useListMyInvitations,
  useListProjects,
} from '../api/generated';
import UserAvatar from '../components/UserAvatar.vue';
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
const passcodes = reactive<Record<string, string>>({});
const acceptErrors = reactive<Record<string, string>>({});
const accepting = ref<string | null>(null);

const CREATE_PROJECT_ERRORS = { validation_error: 'プロジェクト名は1〜200文字で入力してください' };

async function createProject(description: RichTextDoc) {
  await createProjectMutation({
    createProjectRequest: { name: newName.value.trim(), description },
  });
  newName.value = '';
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
  <div class="home">
    <p v-if="loadError" class="error" role="alert">{{ loadError }}</p>

    <section v-if="invitations && invitations.length > 0" data-testid="invitations">
      <h2>届いている招待</h2>
      <ul class="list">
        <li v-for="invitation in invitations" :key="invitation.id" data-testid="invitation">
          <div>
            <strong>{{ invitation.projectName }}</strong>
            <span>（{{ ROLE_LABELS[invitation.role] }}）</span>
            <span class="inviter">
              招待者:
              <UserAvatar
                :name="invitation.invitedBy.name"
                :avatar-url="invitation.invitedBy.avatarUrl"
                :size="20"
              />
              {{ invitation.invitedBy.name }}
            </span>
          </div>
          <form class="inline-form" @submit.prevent="acceptInvitation(invitation.id)">
            <input
              v-model="passcodes[invitation.id]"
              type="password"
              placeholder="暗証番号"
              required
              minlength="4"
              maxlength="32"
              aria-label="暗証番号"
            />
            <button type="submit" :disabled="accepting === invitation.id">受諾</button>
          </form>
          <p v-if="acceptErrors[invitation.id]" class="error" role="alert">
            {{ acceptErrors[invitation.id] }}
          </p>
        </li>
      </ul>
    </section>

    <section>
      <h2>プロジェクト</h2>
      <p v-if="!projects || projects.length === 0">参加しているプロジェクトはありません</p>
      <ul v-else class="list" data-testid="projects">
        <li v-for="project in projects" :key="project.id">
          <router-link :to="{ name: 'project', params: { projectId: project.id } }">
            {{ project.name }}
          </router-link>
          <span class="muted">（{{ ROLE_LABELS[project.role] }}）</span>
        </li>
      </ul>
    </section>

    <section>
      <h2>プロジェクトを作成</h2>
      <RichTextForm
        class="stack-form"
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
      >
        <input
          v-model="newName"
          type="text"
          placeholder="プロジェクト名"
          required
          maxlength="200"
          aria-label="プロジェクト名"
        />
      </RichTextForm>
    </section>
  </div>
</template>

<style scoped>
.list {
  list-style: none;
  padding: 0;
}

.list > li {
  padding: 8px 0;
  border-bottom: 1px solid #ddd;
}

.inline-form {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.stack-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 480px;
}

.inviter {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
}

.muted {
  color: #666;
}

.error {
  color: #c00;
}
</style>
