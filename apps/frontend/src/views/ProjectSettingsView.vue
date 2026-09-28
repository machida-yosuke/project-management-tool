<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { canEdit, isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import {
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  useGetProject,
  useUpdateProject,
} from '../api/generated';
import RichTextContent from '../components/rich-text/RichTextContent.vue';
import RichTextForm from '../components/rich-text/RichTextForm.vue';
import { ApiRequestError, errorMessage } from '../lib/api';
import { draftKeys } from '../lib/drafts';
import { useInvalidate } from '../lib/query';

const route = useRoute();
const invalidate = useInvalidate();

const projectId = computed(() => String(route.params.projectId));
const projectQuery = useGetProject(projectId);

const project = computed(() => projectQuery.data.value ?? null);
const editable = computed(() => (project.value ? canEdit(project.value.role) : false));

const loadError = computed(() => {
  const e = projectQuery.error.value;
  if (!e) return '';
  // Non-members get 404 so the project's existence is not leaked.
  return e instanceof ApiRequestError && e.status === 404
    ? 'プロジェクトが見つかりません'
    : errorMessage(e, {}, 'プロジェクトの読み込みに失敗しました');
});

const DESCRIPTION_ERRORS = { validation_error: '概要が大きすぎるか、形式が正しくありません' };

const nameInput = ref('');
const dirty = ref(false);
const saveError = ref('');
const saveNotice = ref('');

// Only sync while untouched so a background refetch never overwrites in-progress edits.
watch(
  project,
  (value) => {
    if (!value || dirty.value) return;
    nameInput.value = value.name;
  },
  { immediate: true },
);

function markDirty() {
  dirty.value = true;
  saveNotice.value = '';
}

const { mutateAsync: updateProject, isLoading: saving } = useUpdateProject({
  mutation: {
    onSuccess: (_, vars) =>
      invalidate(getGetProjectQueryKey(vars.projectId), getListProjectsQueryKey()),
  },
});

async function save() {
  saveError.value = '';
  saveNotice.value = '';
  try {
    await updateProject({
      projectId: projectId.value,
      updateProjectRequest: { name: nameInput.value.trim() },
    });
    dirty.value = false;
    saveNotice.value = '保存しました';
  } catch (e) {
    saveError.value = errorMessage(
      e,
      { validation_error: '名前は1〜200文字で入力してください' },
      'プロジェクトの更新に失敗しました',
    );
  }
}

// RichTextForm keeps its own draft; after a save it is re-keyed so it restarts from the saved doc.
const savedDescription = ref<RichTextDoc | null>(null);
const descriptionFormKey = ref(0);
const descriptionNotice = ref('');

watch(projectId, () => {
  savedDescription.value = null;
  descriptionNotice.value = '';
});

async function saveDescription(description: RichTextDoc) {
  descriptionNotice.value = '';
  const updated = await updateProject({
    projectId: projectId.value,
    updateProjectRequest: { description },
  });
  savedDescription.value = updated.description;
}

function onDescriptionSaved() {
  descriptionFormKey.value += 1;
  descriptionNotice.value = '保存しました';
}
</script>

<template>
  <div class="settings">
    <p v-if="loadError" class="error" role="alert">{{ loadError }}</p>
    <template v-if="project">
      <header class="header">
        <h2>{{ project.name }} の設定</h2>
        <router-link :to="{ name: 'project', params: { projectId: project.id } }">
          タスクに戻る
        </router-link>
      </header>

      <form
        v-if="editable"
        class="form"
        data-testid="project-form"
        @submit.prevent="save"
        @input="markDirty"
      >
        <label class="field">
          <span>名前</span>
          <input v-model="nameInput" type="text" required maxlength="200" aria-label="名前" />
        </label>
        <div>
          <button type="submit" :disabled="saving">保存</button>
        </div>
        <p v-if="saveNotice" class="notice" role="status">{{ saveNotice }}</p>
        <p v-if="saveError" class="error" role="alert">{{ saveError }}</p>
      </form>
      <section v-if="editable" class="form" data-testid="description-form">
        <h3>概要</h3>
        <RichTextForm
          :key="`${project.id}:${descriptionFormKey}`"
          :project-id="project.id"
          :draft-key="draftKeys.projectDescription(project.id)"
          :initial-doc="savedDescription ?? project.description"
          label="概要"
          placeholder="概要を書く"
          submit-label="保存"
          allow-empty
          :error-messages="DESCRIPTION_ERRORS"
          :submit="saveDescription"
          @submitted="onDescriptionSaved"
        />
        <p v-if="descriptionNotice" class="notice" role="status">{{ descriptionNotice }}</p>
      </section>
      <section v-else data-testid="project-readonly">
        <p class="muted">編集権限がありません</p>
        <h3>名前</h3>
        <p>{{ project.name }}</p>
        <h3>概要</h3>
        <RichTextContent
          v-if="!isRichTextDocEmpty(project.description)"
          data-testid="description"
          :doc="project.description"
        />
      </section>
    </template>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 600px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
