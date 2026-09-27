<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import UserAvatar from '../components/UserAvatar.vue';
import { errorMessage } from '../lib/api';
import { ROLE_LABELS } from '../lib/roles';
import { useInvitationsStore } from '../stores/invitations';
import { useProjectsStore } from '../stores/projects';

const router = useRouter();
const projectsStore = useProjectsStore();
const invitationsStore = useInvitationsStore();

const loadError = ref('');
const newName = ref('');
const newDescription = ref('');
const createError = ref('');
const creating = ref(false);
const passcodes = reactive<Record<string, string>>({});
const acceptErrors = reactive<Record<string, string>>({});
const accepting = ref<string | null>(null);

onMounted(async () => {
  try {
    await Promise.all([projectsStore.fetchProjects(), invitationsStore.fetchMine()]);
  } catch (e) {
    loadError.value = errorMessage(e, {}, '読み込みに失敗しました');
  }
});

async function createProject() {
  createError.value = '';
  creating.value = true;
  try {
    await projectsStore.createProject({
      name: newName.value.trim(),
      description: newDescription.value.trim(),
    });
    newName.value = '';
    newDescription.value = '';
  } catch (e) {
    createError.value = errorMessage(
      e,
      { validation_error: 'プロジェクト名は1〜200文字で入力してください' },
      'プロジェクトの作成に失敗しました',
    );
  } finally {
    creating.value = false;
  }
}

async function acceptInvitation(invitationId: string) {
  acceptErrors[invitationId] = '';
  accepting.value = invitationId;
  try {
    const project = await invitationsStore.accept(invitationId, passcodes[invitationId] ?? '');
    projectsStore.upsertProject(project);
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

    <section v-if="invitationsStore.invitations.length > 0" data-testid="invitations">
      <h2>届いている招待</h2>
      <ul class="list">
        <li
          v-for="invitation in invitationsStore.invitations"
          :key="invitation.id"
          data-testid="invitation"
        >
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
      <p v-if="projectsStore.projects.length === 0">参加しているプロジェクトはありません</p>
      <ul v-else class="list" data-testid="projects">
        <li v-for="project in projectsStore.projects" :key="project.id">
          <router-link :to="{ name: 'project', params: { projectId: project.id } }">
            {{ project.name }}
          </router-link>
          <span class="muted">（{{ ROLE_LABELS[project.role] }}）</span>
        </li>
      </ul>
    </section>

    <section>
      <h2>プロジェクトを作成</h2>
      <form class="stack-form" data-testid="create-project" @submit.prevent="createProject">
        <input
          v-model="newName"
          type="text"
          placeholder="プロジェクト名"
          required
          maxlength="200"
          aria-label="プロジェクト名"
        />
        <textarea
          v-model="newDescription"
          placeholder="説明（任意）"
          maxlength="4000"
          aria-label="説明"
        />
        <button type="submit" :disabled="creating">作成</button>
      </form>
      <p v-if="createError" class="error" role="alert">{{ createError }}</p>
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
