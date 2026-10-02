<script setup lang="ts">
import { computed } from 'vue';
import type { ProjectMember, TaskLabel } from '../../api/generated/models';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import TaskLabelPill from './TaskLabelPill.vue';
import {
  DEFAULT_TASK_FILTERS,
  NONE,
  isFiltering,
  type DueFilter,
  type TaskFilters,
  type TaskSort,
} from '../../lib/task-filters';

const props = withDefaults(
  defineProps<{
    filters: TaskFilters;
    members: Pick<ProjectMember, 'userId' | 'name'>[];
    labels: Pick<TaskLabel, 'id' | 'name' | 'color'>[];
    /** Omit to hide the sort select. */
    sort?: TaskSort;
    showDue?: boolean;
  }>(),
  { sort: undefined, showDue: true },
);

const emit = defineEmits<{
  'update:filters': [filters: TaskFilters];
  'update:sort': [sort: TaskSort];
}>();

// Reka UI's SelectItem rejects an empty-string value, so "all" needs its own token.
const ALL = '__all__';

const DUE_OPTIONS: { value: DueFilter; text: string }[] = [
  { value: 'all', text: 'すべて' },
  { value: 'overdue', text: '期限超過' },
  { value: 'week', text: '今週' },
  { value: 'unset', text: '日付未設定' },
];

const SORT_OPTIONS: { value: TaskSort; text: string }[] = [
  { value: 'created', text: '作成日時' },
  { value: 'end', text: '終了日が近い順' },
  { value: 'updated', text: '更新日時が新しい順' },
];

const filtering = computed(() => isFiltering(props.filters));

function selectValue(value: unknown): string {
  if (typeof value !== 'string') throw new Error(`Unexpected select value: ${String(value)}`);
  return value;
}

function refFilter(value: unknown): string | null {
  const selected = selectValue(value);
  return selected === ALL ? null : selected;
}

function updateFilters(patch: Partial<TaskFilters>) {
  emit('update:filters', { ...props.filters, ...patch });
}

function updateDue(value: unknown) {
  const due = DUE_OPTIONS.find((option) => option.value === value)?.value;
  if (!due) throw new Error(`Unknown due filter: ${String(value)}`);
  updateFilters({ due });
}

function updateSort(value: unknown) {
  const sort = SORT_OPTIONS.find((option) => option.value === value)?.value;
  if (!sort) throw new Error(`Unknown sort: ${String(value)}`);
  emit('update:sort', sort);
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" data-testid="task-filter-bar">
    <Select
      :model-value="filters.assignee ?? ALL"
      @update:model-value="updateFilters({ assignee: refFilter($event) })"
    >
      <SelectTrigger size="sm" class="max-w-full" aria-label="担当者で絞り込む">
        <span class="text-muted-foreground">担当者:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="ALL">すべて</SelectItem>
        <SelectItem :value="NONE">未割り当て</SelectItem>
        <SelectItem v-for="member in members" :key="member.userId" :value="member.userId">
          {{ member.name }}
        </SelectItem>
      </SelectContent>
    </Select>

    <Select
      :model-value="filters.label ?? ALL"
      @update:model-value="updateFilters({ label: refFilter($event) })"
    >
      <SelectTrigger size="sm" class="max-w-full" aria-label="ラベルで絞り込む">
        <span class="text-muted-foreground">ラベル:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="ALL">すべて</SelectItem>
        <SelectItem :value="NONE">ラベルなし</SelectItem>
        <SelectItem v-for="label in labels" :key="label.id" :value="label.id">
          <TaskLabelPill :label="label" />
        </SelectItem>
      </SelectContent>
    </Select>

    <Select v-if="showDue" :model-value="filters.due" @update:model-value="updateDue">
      <SelectTrigger size="sm" class="max-w-full" aria-label="期間で絞り込む">
        <span class="text-muted-foreground">期間:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="option in DUE_OPTIONS" :key="option.value" :value="option.value">
          {{ option.text }}
        </SelectItem>
      </SelectContent>
    </Select>

    <Select v-if="sort !== undefined" :model-value="sort" @update:model-value="updateSort">
      <SelectTrigger size="sm" class="max-w-full" aria-label="並べ替え">
        <span class="text-muted-foreground">並び順:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">
          {{ option.text }}
        </SelectItem>
      </SelectContent>
    </Select>

    <Button
      v-if="filtering"
      type="button"
      variant="ghost"
      size="sm"
      data-testid="clear-filters"
      @click="emit('update:filters', { ...DEFAULT_TASK_FILTERS })"
    >
      絞り込みを解除
    </Button>
  </div>
</template>
