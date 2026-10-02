<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { AccountDeletionBlocked } from '@pm-tool/shared';
import PageHeader from '../components/layout/PageHeader.vue';
import UserAvatar from '../components/UserAvatar.vue';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ApiRequestError, errorMessage } from '../lib/api';
import { eventFile } from '../lib/form';
import { ImageDecodeError, resizeAvatar } from '../lib/image';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const nameInput = ref(authStore.user?.name ?? '');
const nameError = ref('');
const nameNotice = ref('');
const savingName = ref(false);

const avatarError = ref('');
const avatarBusy = ref(false);
// Re-keying the file input clears it so picking the same file again still fires change.
const fileInputKey = ref(0);

const confirmingDelete = ref(false);
const deleting = ref(false);
const deleteError = ref('');
const blockedProjects = ref<AccountDeletionBlocked['projects']>([]);

watch(
  () => authStore.user?.name,
  (name) => {
    nameInput.value = name ?? '';
  },
);

async function saveName() {
  nameError.value = '';
  nameNotice.value = '';
  savingName.value = true;
  try {
    await authStore.updateName(nameInput.value.trim());
    nameNotice.value = '名前を保存しました';
  } catch (e) {
    nameError.value = errorMessage(
      e,
      { validation_error: '名前は1〜100文字で入力してください' },
      '名前の保存に失敗しました',
    );
  } finally {
    savingName.value = false;
  }
}

async function runAvatarAction(action: () => Promise<unknown>, fallback: string) {
  avatarError.value = '';
  avatarBusy.value = true;
  try {
    await action();
  } catch (e) {
    avatarError.value =
      e instanceof ImageDecodeError
        ? '画像を読み込めませんでした'
        : e instanceof ApiRequestError && e.status === 413
          ? '画像の処理に失敗しました。別の画像を試してください'
          : errorMessage(
              e,
              {
                image_too_large: '画像の処理に失敗しました。別の画像を試してください',
                unsupported_media_type: 'PNG / JPEG / WebP / GIF の画像を選んでください',
              },
              fallback,
            );
  } finally {
    avatarBusy.value = false;
    fileInputKey.value += 1;
  }
}

function onAvatarSelected(event: Event) {
  const file = eventFile(event);
  if (!file) return;
  return runAvatarAction(
    async () => authStore.uploadAvatar(await resizeAvatar(file)),
    'アバターのアップロードに失敗しました',
  );
}

function removeAvatar() {
  return runAvatarAction(() => authStore.removeAvatar(), 'アバターの削除に失敗しました');
}

function isDeletionBlocked(details: unknown): details is AccountDeletionBlocked {
  return (
    typeof details === 'object' &&
    details !== null &&
    'projects' in details &&
    Array.isArray(details.projects)
  );
}

function startDelete() {
  deleteError.value = '';
  blockedProjects.value = [];
  confirmingDelete.value = true;
}

async function deleteAccount() {
  deleteError.value = '';
  blockedProjects.value = [];
  deleting.value = true;
  try {
    await authStore.deleteAccount();
    await router.push('/login');
  } catch (e) {
    confirmingDelete.value = false;
    if (
      e instanceof ApiRequestError &&
      e.error === 'owned_projects_have_members' &&
      isDeletionBlocked(e.details)
    ) {
      blockedProjects.value = e.details.projects;
    }
    deleteError.value = errorMessage(
      e,
      {
        owned_projects_have_members:
          '他のメンバーがいるプロジェクトのオーナーのため退会できません。先にプロジェクトを削除してください',
      },
      '退会に失敗しました',
    );
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div v-if="authStore.user" class="max-w-2xl">
    <PageHeader title="設定" />

    <div class="space-y-6">
      <Card class="">
        <CardHeader>
          <CardTitle>プロフィール</CardTitle>
        </CardHeader>
        <form class="flex flex-col gap-6" data-testid="name-form" @submit.prevent="saveName">
          <CardContent class="space-y-2">
            <Label for="settings-name">名前</Label>
            <Input
              id="settings-name"
              v-model="nameInput"
              class="max-w-sm"
              type="text"
              required
              maxlength="100"
              aria-label="名前"
            />
          </CardContent>
          <CardFooter class="gap-3">
            <Button type="submit" :disabled="savingName">保存</Button>
            <p v-if="nameNotice" class="text-sm text-muted-foreground" role="status">
              {{ nameNotice }}
            </p>
            <p v-if="nameError" class="text-sm text-destructive" role="alert">{{ nameError }}</p>
          </CardFooter>
        </form>
      </Card>

      <Card class="" data-testid="avatar-section">
        <CardHeader>
          <CardTitle>アバター</CardTitle>
          <CardDescription>PNG / JPEG / WebP / GIF</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex items-center gap-4">
            <UserAvatar
              :user-id="authStore.user.id"
              :name="authStore.user.name"
              :avatar-url="authStore.user.avatarUrl"
              :size="80"
            />
            <div class="flex flex-wrap items-center gap-2">
              <!-- Native file input: the Input component always binds v-model, which a file input cannot use. -->
              <input
                :key="fileInputKey"
                class="text-sm text-muted-foreground file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                aria-label="アバター画像"
                :disabled="avatarBusy"
                @change="onAvatarSelected"
              />
              <Button
                v-if="authStore.user.avatarUrl"
                type="button"
                variant="outline"
                size="sm"
                :disabled="avatarBusy"
                @click="removeAvatar"
              >
                アバターを削除
              </Button>
            </div>
          </div>
          <p v-if="avatarError" class="text-sm text-destructive" role="alert">{{ avatarError }}</p>
        </CardContent>
      </Card>

      <Card class="border-destructive/50" data-testid="delete-account">
        <CardHeader>
          <CardTitle>退会</CardTitle>
          <CardDescription>アカウントを削除します。この操作は元に戻せません。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <AlertDialog v-model:open="confirmingDelete">
            <AlertDialogTrigger as-child>
              <Button type="button" variant="destructive" :disabled="deleting" @click="startDelete">
                退会する
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>退会する</AlertDialogTitle>
                <AlertDialogDescription>
                  退会すると元に戻せません。自分だけが参加しているプロジェクトは削除されます。作成したタスクやコメントは「退会したユーザー」として残ります。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel :disabled="deleting">キャンセル</AlertDialogCancel>
                <!-- A plain Button instead of AlertDialogAction keeps the dialog open while the request runs. -->
                <Button
                  type="button"
                  variant="destructive"
                  :disabled="deleting"
                  @click="deleteAccount"
                >
                  退会する
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <p v-if="deleteError" class="text-sm text-destructive" role="alert">{{ deleteError }}</p>
          <ul
            v-if="blockedProjects.length > 0"
            class="list-disc pl-5 text-sm"
            data-testid="blocking-projects"
          >
            <li v-for="project in blockedProjects" :key="project.id">
              <router-link
                :to="{ name: 'project', params: { projectId: project.id } }"
                class="underline underline-offset-4"
              >
                {{ project.name }}
              </router-link>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
