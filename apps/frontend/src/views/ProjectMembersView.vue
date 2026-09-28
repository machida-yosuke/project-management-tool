<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  canManageMembers,
  PROJECT_ROLES,
  type ProjectMember,
  type ProjectRole,
} from '@pm-tool/shared';
import {
  getGetProjectQueryKey,
  getListMembersQueryKey,
  getListProjectInvitationsQueryKey,
  useCreateInvitation,
  useDeleteInvitation,
  useGetProject,
  useListMembers,
  useListProjectInvitations,
  useRemoveMember,
  useUpdateMemberRole,
} from '../api/generated';
import UserAvatar from '../components/UserAvatar.vue';
import { ApiRequestError, errorMessage } from '../lib/api';
import { eventValue } from '../lib/form';
import { useInvalidate } from '../lib/query';
import { ROLE_LABELS } from '../lib/roles';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const authStore = useAuthStore();
const invalidate = useInvalidate();

const projectId = computed(() => String(route.params.projectId));
const projectQuery = useGetProject(projectId);
const membersQuery = useListMembers(projectId);

const project = computed(() => projectQuery.data.value ?? null);
const members = computed(() => membersQuery.data.value ?? []);
const isAdmin = computed(() => (project.value ? canManageMembers(project.value.role) : false));

const invitationsQuery = useListProjectInvitations(projectId, () => ({
  query: { enabled: isAdmin.value },
}));
const invitations = computed(() => invitationsQuery.data.value ?? []);

const loadError = computed(() => {
  const e =
    projectQuery.error.value ?? membersQuery.error.value ?? invitationsQuery.error.value ?? null;
  if (!e) return '';
  // Non-members get 404 so the project's existence is not leaked.
  return e instanceof ApiRequestError && e.status === 404
    ? 'プロジェクトが見つかりません'
    : errorMessage(e, {}, 'メンバーの読み込みに失敗しました');
});

const actionError = ref('');
const inviteForm = reactive<{ email: string; role: ProjectRole; passcode: string }>({
  email: '',
  role: 'staff',
  passcode: '',
});

const { mutateAsync: updateMemberRole } = useUpdateMemberRole({
  mutation: {
    onSuccess: (_, vars) =>
      invalidate(
        getListMembersQueryKey(vars.projectId),
        // Demoting yourself changes what this page may show.
        ...(vars.userId === authStore.user?.id ? [getGetProjectQueryKey(vars.projectId)] : []),
      ),
  },
});
const { mutateAsync: removeMemberRequest } = useRemoveMember({
  mutation: { onSuccess: (_, vars) => invalidate(getListMembersQueryKey(vars.projectId)) },
});
const { mutateAsync: createInvitation } = useCreateInvitation({
  mutation: {
    onSuccess: (_, vars) => invalidate(getListProjectInvitationsQueryKey(vars.projectId)),
  },
});
const { mutateAsync: deleteInvitation } = useDeleteInvitation({
  mutation: {
    onSuccess: (_, vars) => invalidate(getListProjectInvitationsQueryKey(vars.projectId)),
  },
});

async function runAction(action: () => Promise<unknown>, messages: Record<string, string> = {}) {
  actionError.value = '';
  try {
    await action();
  } catch (e) {
    actionError.value = errorMessage(e, messages, '操作に失敗しました');
  }
}

function changeRole(member: ProjectMember, event: Event) {
  const role = eventValue(event) as ProjectRole;
  return runAction(
    () =>
      updateMemberRole({
        projectId: projectId.value,
        userId: member.userId,
        updateMemberRoleRequest: { role },
      }),
    { owner_immutable: 'オーナーのロールは変更できません' },
  );
}

function removeMember(member: ProjectMember) {
  return runAction(
    () => removeMemberRequest({ projectId: projectId.value, userId: member.userId }),
    { owner_immutable: 'オーナーは削除できません' },
  );
}

function invite() {
  return runAction(
    async () => {
      await createInvitation({
        projectId: projectId.value,
        createInvitationRequest: {
          email: inviteForm.email.trim(),
          role: inviteForm.role,
          passcode: inviteForm.passcode,
        },
      });
      inviteForm.email = '';
      inviteForm.role = 'staff';
      inviteForm.passcode = '';
    },
    {
      already_member: 'このメールアドレスのユーザーはすでにメンバーです',
      validation_error: 'メールアドレスと暗証番号（4〜32文字）を確認してください',
    },
  );
}

function cancelInvitation(invitationId: string) {
  return runAction(() => deleteInvitation({ projectId: projectId.value, invitationId }));
}

function canRemove(member: ProjectMember) {
  return !member.isOwner && member.userId !== authStore.user?.id;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP');
}
</script>

<template>
  <div>
    <p v-if="loadError" class="error" role="alert">{{ loadError }}</p>
    <template v-if="project">
      <header class="header">
        <h2>{{ project.name }} のメンバー</h2>
        <router-link :to="{ name: 'project', params: { projectId: project.id } }">
          TODO に戻る
        </router-link>
        <router-link :to="{ name: 'project-calendar', params: { projectId: project.id } }">
          カレンダー
        </router-link>
      </header>
      <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>

      <table class="table">
        <thead>
          <tr>
            <th>名前</th>
            <th>メール</th>
            <th>ロール</th>
            <th v-if="isAdmin" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="member in members" :key="member.userId" data-testid="member">
            <td>
              <span class="name-cell">
                <UserAvatar :name="member.name" :avatar-url="member.avatarUrl" />
                {{ member.name }}
                <span v-if="member.isOwner" class="muted">（オーナー）</span>
              </span>
            </td>
            <td>{{ member.email }}</td>
            <td>
              <select
                v-if="isAdmin && !member.isOwner"
                :value="member.role"
                aria-label="ロール"
                @change="changeRole(member, $event)"
              >
                <option v-for="role in PROJECT_ROLES" :key="role" :value="role">
                  {{ ROLE_LABELS[role] }}
                </option>
              </select>
              <span v-else>{{ ROLE_LABELS[member.role] }}</span>
            </td>
            <td v-if="isAdmin">
              <button v-if="canRemove(member)" type="button" @click="removeMember(member)">
                削除
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <template v-if="isAdmin">
        <section>
          <h3>招待する</h3>
          <p class="muted">
            暗証番号は招待相手に別の手段で伝えてください。あとから確認はできません。
          </p>
          <form class="inline-form" data-testid="invite-form" @submit.prevent="invite">
            <input
              v-model="inviteForm.email"
              type="email"
              placeholder="メールアドレス"
              required
              aria-label="メールアドレス"
            />
            <select v-model="inviteForm.role" aria-label="招待するロール">
              <option v-for="role in PROJECT_ROLES" :key="role" :value="role">
                {{ ROLE_LABELS[role] }}
              </option>
            </select>
            <input
              v-model="inviteForm.passcode"
              type="password"
              placeholder="暗証番号"
              required
              minlength="4"
              maxlength="32"
              autocomplete="new-password"
              aria-label="暗証番号"
            />
            <button type="submit">招待</button>
          </form>
        </section>

        <section>
          <h3>未受諾の招待</h3>
          <p v-if="invitations.length === 0" class="muted">未受諾の招待はありません</p>
          <ul class="list">
            <li
              v-for="invitation in invitations"
              :key="invitation.id"
              data-testid="pending-invitation"
            >
              <span>{{ invitation.email }}</span>
              <span>（{{ ROLE_LABELS[invitation.role] }}）</span>
              <span class="muted">期限: {{ formatDate(invitation.expiresAt) }}</span>
              <button type="button" @click="cancelInvitation(invitation.id)">取消</button>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.table {
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 6px 12px;
  border-bottom: 1px solid #ddd;
  text-align: left;
}

.name-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.list {
  list-style: none;
  padding: 0;
}

.list > li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.muted {
  color: #666;
}

.error {
  color: #c00;
}
</style>
