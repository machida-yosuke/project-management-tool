import type { Task } from '@pm-tool/shared';
import type { LocationQuery, LocationQueryValue } from 'vue-router';
import { dueState } from './due-state';
import { addDays, startOfWeek, todayString, type DateString } from './dates';

export const NONE = 'none';

export type DueFilter = 'all' | 'overdue' | 'week' | 'unset';
export type TaskSort = 'created' | 'end' | 'updated';

export interface TaskFilters {
  /** `null` matches every task, `NONE` only unassigned ones, otherwise a user id. */
  assignee: string | null;
  /** `null` matches every task, `NONE` only unlabeled ones, otherwise a label id. */
  label: string | null;
  due: DueFilter;
}

export const DEFAULT_TASK_FILTERS: Readonly<TaskFilters> = {
  assignee: null,
  label: null,
  due: 'all',
};
export const DEFAULT_TASK_SORT: TaskSort = 'created';

const DUE_FILTERS: readonly DueFilter[] = ['all', 'overdue', 'week', 'unset'];
const TASK_SORTS: readonly TaskSort[] = ['created', 'end', 'updated'];
const QUERY_KEYS = ['assignee', 'label', 'due', 'sort'] as const;

type FilterableTask = Pick<Task, 'assignee' | 'label' | 'status' | 'startDate' | 'endDate'>;
type SortableTask = Pick<Task, 'endDate' | 'createdAt' | 'updatedAt'>;

function firstString(value: LocationQueryValue | LocationQueryValue[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first !== '' ? first : null;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

export function filtersFromQuery(query: LocationQuery): TaskFilters {
  return {
    assignee: firstString(query.assignee),
    label: firstString(query.label),
    due: oneOf(firstString(query.due), DUE_FILTERS, 'all'),
  };
}

export function sortFromQuery(query: LocationQuery): TaskSort {
  return oneOf(firstString(query.sort), TASK_SORTS, DEFAULT_TASK_SORT);
}

/** Replaces the filter and sort keys of `query`, omitting defaults and keeping unrelated keys such as `date`. */
export function withTaskQuery(
  query: LocationQuery,
  filters: TaskFilters,
  sort: TaskSort = DEFAULT_TASK_SORT,
): LocationQuery {
  const next: LocationQuery = { ...query };
  for (const key of QUERY_KEYS) delete next[key];
  if (filters.assignee !== null) next.assignee = filters.assignee;
  if (filters.label !== null) next.label = filters.label;
  if (filters.due !== 'all') next.due = filters.due;
  if (sort !== DEFAULT_TASK_SORT) next.sort = sort;
  return next;
}

export function isFiltering(filters: TaskFilters): boolean {
  return filters.assignee !== null || filters.label !== null || filters.due !== 'all';
}

function matchesRef(ref: { id: string } | null, filter: string | null): boolean {
  if (filter === null) return true;
  if (filter === NONE) return ref === null;
  return ref?.id === filter;
}

function matchesDue(task: FilterableTask, due: DueFilter, today: DateString): boolean {
  switch (due) {
    case 'all':
      return true;
    case 'overdue':
      return dueState(task.endDate, task.status, today) === 'overdue';
    case 'week': {
      const monday = startOfWeek(today);
      return task.endDate !== null && task.endDate >= monday && task.endDate <= addDays(monday, 6);
    }
    case 'unset':
      return task.startDate === null && task.endDate === null;
  }
}

export function applyTaskFilters<T extends FilterableTask>(
  tasks: readonly T[],
  filters: TaskFilters,
  today: DateString = todayString(),
): T[] {
  return tasks.filter(
    (task) =>
      matchesRef(task.assignee, filters.assignee) &&
      matchesRef(task.label, filters.label) &&
      matchesDue(task, filters.due, today),
  );
}

function compareEndDate(a: SortableTask, b: SortableTask): number {
  if (a.endDate === b.endDate) return 0;
  if (a.endDate === null) return 1;
  if (b.endDate === null) return -1;
  return a.endDate < b.endDate ? -1 : 1;
}

const COMPARATORS: Record<TaskSort, (a: SortableTask, b: SortableTask) => number> = {
  created: (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  end: compareEndDate,
  updated: (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
};

/** Stable, so ties keep the API order (creation order). */
export function sortTasks<T extends SortableTask>(tasks: readonly T[], sort: TaskSort): T[] {
  return [...tasks].sort(COMPARATORS[sort]);
}
