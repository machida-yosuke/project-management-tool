<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router';
import { canEdit, emptyRichTextDoc, isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import { FileText } from '@lucide/vue';
import { useCreateManualPage, useGetProject, useListManualPages } from '../api/generated';
import RichTextForm from '../components/rich-text/RichTextForm.vue';
import RelativeTime from '../components/task/RelativeTime.vue';
import UserAvatar from '../components/UserAvatar.vue';
import EmptyState from '../components/layout/EmptyState.vue';
import ProjectHeader from '../components/layout/ProjectHeader.vue';
import ProjectNotFound from '../components/layout/ProjectNotFound.vue';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { ApiRequestError, errorMessage } from '../lib/api';
import { draftKeys } from '../lib/drafts';
import { listManualPagesKeyPrefix, useInvalidate } from '../lib/query';

const SEARCH_DELAY_MS = 300;
const CREATE_MANUAL_ERRORS = { validation_error: 'タイトルは1〜200文字で入力してください' };

const route = useRoute();
const router = useRouter();
const invalidate = useInvalidate();

const projectId = computed(() => String(route.params.projectId));
const searchQuery = computed(() => {
  const value = Array.isArray(route.query.q) ? route.query.q[0] : route.query.q;
  return typeof value === 'string' ? value.trim() : '';
});

const projectQuery = useGetProject(projectId);
// Omit the param when empty so the unfiltered request stays `GET /manuals` with no query string.
const manualsQuery = useListManualPages(projectId, () =>
  searchQuery.value === '' ? undefined : { q: searchQuery.value },
);

const project = computed(() => projectQuery.data.value ?? null);
const manuals = computed(() => manualsQuery.data.value);
const editable = computed(() => (project.value ? canEdit(project.value.role) : false));

const firstLoadError = computed(() => projectQuery.error.value ?? manualsQuery.error.value);
const projectNotFound = computed(() => {
  const e = firstLoadError.value;
  return e instanceof ApiRequestError && e.status === 404;
});
const loadError = computed(() => {
  if (projectNotFound.value) return '';
  const e = firstLoadError.value;
  return e ? errorMessage(e, {}, 'マニュアルの読み込みに失敗しました') : '';
});

const searchInput = ref(searchQuery.value);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPendingSearch() {
  if (searchTimer !== null) clearTimeout(searchTimer);
  searchTimer = null;
}

function withSearchQuery(query: LocationQuery, q: string): LocationQuery {
  const next: LocationQuery = { ...query };
  delete next.q;
  if (q !== '') next.q = q;
  return next;
}

function onSearchInput(value: string | number) {
  searchInput.value = String(value);
  cancelPendingSearch();
  searchTimer = setTimeout(() => {
    searchTimer = null;
    void router.replace({ query: withSearchQuery(route.query, searchInput.value.trim()) });
  }, SEARCH_DELAY_MS);
}

// Back/forward navigation changes `q` without typing, so the input follows the URL.
watch(searchQuery, (q) => {
  if (q !== searchInput.value.trim()) searchInput.value = q;
});

// A timer firing after leaving the page would rewrite the next page's query.
onScopeDispose(cancelPendingSearch);

const emptyBody = emptyRichTextDoc();
const newTitle = ref('');
const createOpen = ref(false);
const creating = ref(false);
const createdId = ref<string | null>(null);

watch(projectId, () => {
  newTitle.value = '';
  createOpen.value = false;
});

const createManualMutation = useCreateManualPage({
  mutation: { onSuccess: (_, vars) => invalidate(listManualPagesKeyPrefix(vars.projectId)) },
});

async function createManual(body: RichTextDoc) {
  creating.value = true;
  try {
    const created = await createManualMutation.mutateAsync({
      projectId: projectId.value,
      createManualPageRequest: {
        title: newTitle.value.trim(),
        ...(isRichTextDocEmpty(body) ? {} : { body }),
      },
    });
    createdId.value = created.id;
    newTitle.value = '';
  } finally {
    creating.value = false;
  }
}

// Navigating only after `submitted` lets the form discard its draft before the view unmounts.
async function onCreated() {
  createOpen.value = false;
  const manualId = createdId.value;
  createdId.value = null;
  if (manualId === null) return;
  await router.push({ name: 'manual', params: { projectId: projectId.value, manualId } });
}

function onCreateInteractOutside(event: Event) {
  if (creating.value) event.preventDefault();
}
</script>

<template>
  <div>
    <ProjectNotFound v-if="projectNotFound" />
    <p v-if="loadError" class="my-4 text-destructive" role="alert">{{ loadError }}</p>
    <template v-if="project">
      <ProjectHeader :project="project" />

      <section class="space-y-4" aria-label="マニュアル">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <Input
            :model-value="searchInput"
            type="search"
            class="max-w-sm"
            placeholder="マニュアルを検索"
            aria-label="マニュアルを検索"
            @update:model-value="onSearchInput"
          />
          <Dialog v-if="editable" v-model:open="createOpen">
            <DialogTrigger as-child>
              <Button type="button" size="sm">ページを作成</Button>
            </DialogTrigger>
            <DialogContent class="sm:max-w-2xl" @interact-outside="onCreateInteractOutside">
              <DialogHeader>
                <DialogTitle>ページを作成</DialogTitle>
              </DialogHeader>
              <RichTextForm
                :key="projectId"
                data-testid="create-manual"
                :project-id="projectId"
                :draft-key="draftKeys.newManual(projectId)"
                :initial-doc="emptyBody"
                label="ページの本文"
                placeholder="本文（任意）"
                submit-label="追加"
                allow-empty
                :error-messages="CREATE_MANUAL_ERRORS"
                :submit="createManual"
                @submitted="onCreated"
              >
                <Input
                  v-model="newTitle"
                  type="text"
                  placeholder="ページを追加"
                  required
                  maxlength="200"
                  aria-label="ページのタイトル"
                />
              </RichTextForm>
            </DialogContent>
          </Dialog>
        </div>

        <div v-if="manuals" class="rounded-lg border">
          <div
            class="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2 text-sm"
            data-testid="manual-count"
          >
            {{ searchQuery === '' ? 'ページ' : '検索結果' }} {{ manuals.length }} 件
          </div>
          <EmptyState
            v-if="manuals.length === 0 && searchQuery !== ''"
            class="rounded-none border-0"
            message="該当するマニュアルはありません"
          />
          <EmptyState
            v-else-if="manuals.length === 0"
            class="rounded-none border-0"
            message="マニュアルはまだありません"
          >
            <Button v-if="editable" type="button" size="sm" @click="createOpen = true">
              ページを作成
            </Button>
          </EmptyState>
          <ul v-else class="divide-y">
            <li
              v-for="manual in manuals"
              :key="manual.id"
              class="flex items-start gap-3 px-4 py-3 hover:bg-muted/30"
              data-testid="manual"
            >
              <FileText class="mt-0.5 size-4 flex-none text-muted-foreground" aria-hidden="true" />
              <div class="min-w-0 flex-1">
                <RouterLink
                  :to="{ name: 'manual', params: { projectId, manualId: manual.id } }"
                  class="min-w-0 font-semibold break-words hover:text-primary hover:underline"
                  data-testid="manual-open"
                >
                  {{ manual.title }}
                </RouterLink>
                <p class="mt-1 text-xs text-muted-foreground" data-testid="manual-meta">
                  {{ manual.createdBy.name }} が
                  <RelativeTime :datetime="manual.createdAt" />
                  に作成<template v-if="manual.updatedAt !== manual.createdAt">
                    · <RelativeTime :datetime="manual.updatedAt" />に更新</template
                  >
                </p>
              </div>
              <UserAvatar
                :user-id="manual.createdBy.id"
                :name="manual.createdBy.name"
                :avatar-url="manual.createdBy.avatarUrl"
                :size="20"
                :title="manual.createdBy.name"
                data-testid="manual-created-by"
              />
            </li>
          </ul>
        </div>
      </section>
    </template>
  </div>
</template>
