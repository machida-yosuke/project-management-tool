<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { canEdit, isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import { Pencil } from '@lucide/vue';
import {
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  useUpdateProject,
} from '../../api/generated';
import type { Project } from '../../api/generated/models';
import RichTextContent from '../rich-text/RichTextContent.vue';
import RichTextForm from '../rich-text/RichTextForm.vue';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { draftKeys } from '../../lib/drafts';
import { useInvalidate } from '../../lib/query';
import { cn } from '../../lib/utils';

const props = defineProps<{ project: Project }>();

const route = useRoute();
const invalidate = useInvalidate();

const tabs = computed(() =>
  [
    { name: 'project', label: 'ホーム', routeNames: ['project'] },
    { name: 'project-tasks', label: 'タスク', routeNames: ['project-tasks', 'task'] },
    { name: 'project-calendar', label: 'カレンダー', routeNames: ['project-calendar'] },
    { name: 'project-labels', label: 'ラベル', routeNames: ['project-labels'] },
    { name: 'project-members', label: 'メンバー', routeNames: ['project-members'] },
  ].map(({ routeNames, ...tab }) => ({
    ...tab,
    to: { name: tab.name, params: { projectId: props.project.id } },
    // Compared by route name because /projects/:id is a path prefix of every other tab.
    active: typeof route.name === 'string' && routeNames.includes(route.name),
  })),
);

const isHome = computed(() => route.name === 'project');
const editable = computed(() => canEdit(props.project.role));

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
  validation_error: '名前は1〜200文字、概要は正しい形式で入力してください',
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

function onInteractOutside(event: Event) {
  if (saving.value) event.preventDefault();
}
</script>

<template>
  <div class="mb-6 border-b">
    <template v-if="isHome">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-semibold tracking-tight">{{ project.name }}</h1>
        <Dialog v-if="editable" v-model:open="editOpen">
          <DialogTrigger as-child>
            <Button type="button" variant="ghost" size="icon" aria-label="プロジェクトを編集">
              <Pencil aria-hidden="true" />
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
              label="概要"
              placeholder="概要を書く"
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
          </DialogContent>
        </Dialog>
      </div>
      <RichTextContent
        v-if="!isRichTextDocEmpty(project.description)"
        class="mt-2 text-sm text-muted-foreground"
        data-testid="project-description"
        :doc="project.description"
      />
    </template>
    <nav
      :class="cn('-mb-px flex gap-6 text-sm font-medium', isHome && 'mt-4')"
      aria-label="プロジェクト"
    >
      <RouterLink
        v-for="tab in tabs"
        :key="tab.name"
        :to="tab.to"
        :aria-current="tab.active ? 'page' : undefined"
        :class="
          cn(
            'border-b-2 pb-2 transition-colors',
            tab.active
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )
        "
      >
        {{ tab.label }}
      </RouterLink>
    </nav>
  </div>
</template>
