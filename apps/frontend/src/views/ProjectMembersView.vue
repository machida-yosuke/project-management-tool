<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
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
import EmptyState from '../components/layout/EmptyState.vue';
import ProjectHeader from '../components/layout/ProjectHeader.vue';
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
import { Badge } from '../components/ui/badge';
import { Button, buttonVariants } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { ApiRequestError, errorMessage } from '../lib/api';
import { useInvalidate } from '../lib/query';
import { ROLE_LABELS } from '../lib/roles';
import { useAuthStore } from '../stores/auth';

const destructiveClass = buttonVariants({ variant: 'destructive' });

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
const inviteOpen = ref(false);
const inviteError = ref('');
const inviting = ref(false);

watch(inviteOpen, (open) => {
  if (open) inviteError.value = '';
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

function toRole(value: unknown): ProjectRole {
  const role = PROJECT_ROLES.find((r) => r === value);
  if (!role) throw new Error(`Unknown project role: ${String(value)}`);
  return role;
}

function setInviteRole(value: unknown) {
  inviteForm.role = toRole(value);
}

function changeRole(member: ProjectMember, value: unknown) {
  const role = toRole(value);
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

async function invite() {
  if (inviting.value) return;
  inviteError.value = '';
  inviting.value = true;
  try {
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
    inviteOpen.value = false;
  } catch (e) {
    inviteError.value = errorMessage(
      e,
      {
        already_member: 'このメールアドレスのユーザーはすでにメンバーです',
        validation_error: 'メールアドレスと暗証番号（4〜32文字）を確認してください',
      },
      '操作に失敗しました',
    );
  } finally {
    inviting.value = false;
  }
}

function onInviteInteractOutside(event: Event) {
  if (inviting.value) event.preventDefault();
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
    <p v-if="loadError" class="my-4 text-destructive" role="alert">{{ loadError }}</p>
    <template v-if="project">
      <ProjectHeader :project="project" />
      <p v-if="actionError" class="mb-4 text-sm text-destructive" role="alert">
        {{ actionError }}
      </p>

      <div class="flex flex-col gap-8">
        <section>
          <div class="mb-3 flex items-center justify-between gap-2">
            <h2 class="text-lg font-semibold">メンバー</h2>
            <Dialog v-if="isAdmin" v-model:open="inviteOpen">
              <DialogTrigger as-child>
                <Button type="button" size="sm">招待する</Button>
              </DialogTrigger>
              <DialogContent @interact-outside="onInviteInteractOutside">
                <DialogHeader>
                  <DialogTitle>招待する</DialogTitle>
                  <DialogDescription>
                    暗証番号は招待相手に別の手段で伝えてください。あとから確認はできません。
                  </DialogDescription>
                </DialogHeader>
                <form class="grid gap-4" data-testid="invite-form" @submit.prevent="invite">
                  <div class="grid gap-2">
                    <Label for="invite-email">メールアドレス</Label>
                    <Input
                      id="invite-email"
                      v-model="inviteForm.email"
                      type="email"
                      placeholder="name@example.com"
                      required
                      aria-label="メールアドレス"
                    />
                  </div>
                  <div class="grid gap-2">
                    <Label for="invite-role">ロール</Label>
                    <Select :model-value="inviteForm.role" @update:model-value="setInviteRole">
                      <SelectTrigger id="invite-role" class="w-full" aria-label="招待するロール">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="role in PROJECT_ROLES" :key="role" :value="role">
                          {{ ROLE_LABELS[role] }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div class="grid gap-2">
                    <Label for="invite-passcode">暗証番号</Label>
                    <Input
                      id="invite-passcode"
                      v-model="inviteForm.passcode"
                      type="password"
                      placeholder="4〜32文字"
                      required
                      minlength="4"
                      maxlength="32"
                      autocomplete="new-password"
                      aria-label="暗証番号"
                    />
                  </div>
                  <p v-if="inviteError" class="text-sm text-destructive" role="alert">
                    {{ inviteError }}
                  </p>
                  <DialogFooter>
                    <Button type="submit" :disabled="inviting">招待</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div class="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow class="hover:bg-transparent">
                  <TableHead class="px-4">メンバー</TableHead>
                  <TableHead class="px-4">ロール</TableHead>
                  <TableHead v-if="isAdmin" class="px-4">
                    <span class="sr-only">操作</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="member in members"
                  :key="member.userId"
                  class="last:border-b-0"
                  data-testid="member"
                >
                  <TableCell class="px-4 py-3">
                    <div class="flex items-center gap-3">
                      <UserAvatar :name="member.name" :avatar-url="member.avatarUrl" />
                      <div class="flex flex-col">
                        <span class="flex items-center gap-2 font-medium">
                          {{ member.name }}
                          <Badge v-if="member.isOwner" variant="secondary">オーナー</Badge>
                        </span>
                        <span class="text-xs text-muted-foreground">{{ member.email }}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell class="px-4 py-3">
                    <Select
                      v-if="isAdmin && !member.isOwner"
                      :model-value="member.role"
                      @update:model-value="changeRole(member, $event)"
                    >
                      <SelectTrigger size="sm" aria-label="ロール">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="role in PROJECT_ROLES" :key="role" :value="role">
                          {{ ROLE_LABELS[role] }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge v-else variant="outline">{{ ROLE_LABELS[member.role] }}</Badge>
                  </TableCell>
                  <TableCell v-if="isAdmin" class="px-4 py-3 text-right">
                    <AlertDialog v-if="canRemove(member)">
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
                          <AlertDialogTitle>メンバーを削除</AlertDialogTitle>
                          <AlertDialogDescription>
                            {{ member.name }} をこのプロジェクトから削除します。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>キャンセル</AlertDialogCancel>
                          <AlertDialogAction
                            :class="destructiveClass"
                            @click="removeMember(member)"
                          >
                            削除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>

        <section v-if="isAdmin">
          <h2 class="mb-3 text-lg font-semibold">未受諾の招待</h2>
          <EmptyState v-if="invitations.length === 0" message="未受諾の招待はありません" />
          <div v-else class="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow class="hover:bg-transparent">
                  <TableHead class="px-4">メールアドレス</TableHead>
                  <TableHead class="px-4">ロール</TableHead>
                  <TableHead class="px-4">期限</TableHead>
                  <TableHead class="px-4">
                    <span class="sr-only">操作</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="invitation in invitations"
                  :key="invitation.id"
                  class="last:border-b-0"
                  data-testid="pending-invitation"
                >
                  <TableCell class="px-4 py-3">{{ invitation.email }}</TableCell>
                  <TableCell class="px-4 py-3">
                    <Badge variant="outline">{{ ROLE_LABELS[invitation.role] }}</Badge>
                  </TableCell>
                  <TableCell class="px-4 py-3 text-muted-foreground">
                    {{ formatDate(invitation.expiresAt) }}
                  </TableCell>
                  <TableCell class="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      @click="cancelInvitation(invitation.id)"
                    >
                      取消
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
