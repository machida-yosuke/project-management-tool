<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { AccountDeletionBlocked } from '@pm-tool/shared';
import UserAvatar from '../components/UserAvatar.vue';
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
    nameNotice.value = '名前を更新しました';
  } catch (e) {
    nameError.value = errorMessage(
      e,
      { validation_error: '名前は1〜100文字で入力してください' },
      '名前の更新に失敗しました',
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

function cancelDelete() {
  confirmingDelete.value = false;
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
  <div v-if="authStore.user" class="settings">
    <h2>設定</h2>

    <section>
      <h3>名前</h3>
      <form class="inline-form" data-testid="name-form" @submit.prevent="saveName">
        <input v-model="nameInput" type="text" required maxlength="100" aria-label="名前" />
        <button type="submit" :disabled="savingName">保存</button>
      </form>
      <p v-if="nameNotice" class="notice" role="status">{{ nameNotice }}</p>
      <p v-if="nameError" class="error" role="alert">{{ nameError }}</p>
    </section>

    <section data-testid="avatar-section">
      <h3>アバター</h3>
      <div class="avatar-row">
        <UserAvatar :name="authStore.user.name" :avatar-url="authStore.user.avatarUrl" :size="64" />
        <input
          :key="fileInputKey"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label="アバター画像"
          :disabled="avatarBusy"
          @change="onAvatarSelected"
        />
        <button
          v-if="authStore.user.avatarUrl"
          type="button"
          :disabled="avatarBusy"
          @click="removeAvatar"
        >
          アバターを削除
        </button>
      </div>
      <p class="muted">PNG / JPEG / WebP / GIF</p>
      <p v-if="avatarError" class="error" role="alert">{{ avatarError }}</p>
    </section>

    <section data-testid="delete-account">
      <h3>退会</h3>
      <template v-if="confirmingDelete">
        <p>
          退会すると元に戻せません。自分だけが参加しているプロジェクトは削除されます。作成したタスクやコメントは「退会したユーザー」として残ります。
        </p>
        <div class="inline-form">
          <button type="button" class="danger" :disabled="deleting" @click="deleteAccount">
            本当に退会する
          </button>
          <button type="button" :disabled="deleting" @click="cancelDelete">キャンセル</button>
        </div>
      </template>
      <button v-else type="button" class="danger" @click="startDelete">退会する</button>
      <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
      <ul v-if="blockedProjects.length > 0" class="list" data-testid="blocking-projects">
        <li v-for="project in blockedProjects" :key="project.id">
          <router-link :to="{ name: 'project', params: { projectId: project.id } }">
            {{ project.name }}
          </router-link>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.settings section {
  margin-bottom: 24px;
}

.inline-form,
.avatar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.list {
  padding-left: 20px;
}

.danger {
  color: #c00;
}

.muted {
  color: #666;
}

.notice {
  color: #070;
}

.error {
  color: #c00;
}
</style>
