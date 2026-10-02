import type { TaskStatus } from '@pm-tool/shared';
import { diffDays, todayString, type DateString } from './dates';

export type DueState = 'overdue' | 'soon' | 'normal';

const SOON_WITHIN_DAYS = 3;

export function dueState(
  dueDate: DateString | null,
  status: TaskStatus,
  today: DateString = todayString(),
): DueState {
  if (dueDate === null || status === 'done') return 'normal';
  const daysLeft = diffDays(today, dueDate);
  if (daysLeft < 0) return 'overdue';
  // "Within 3 days" counts today, so it covers today and the next two days.
  if (daysLeft < SOON_WITHIN_DAYS) return 'soon';
  return 'normal';
}

const DUE_STATE_CLASSES: Record<DueState, string> = {
  overdue: 'font-medium text-destructive',
  soon: 'font-medium text-warning',
  normal: '',
};

export function dueStateClass(dueDate: DateString | null, status: TaskStatus): string {
  return DUE_STATE_CLASSES[dueState(dueDate, status)];
}
