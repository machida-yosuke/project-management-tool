import { diffDays, type DateString } from './dates';

export interface DatedTask {
  id: string;
  startDate: DateString;
  endDate: DateString;
}

export interface VisibleSpan {
  startCol: number;
  span: number;
  clipStart: boolean;
  clipEnd: boolean;
}

export function visibleSpan(task: DatedTask, range: readonly DateString[]): VisibleSpan | null {
  const first = range[0];
  const last = range[range.length - 1];
  if (first === undefined || last === undefined) return null;
  if (task.endDate < first || task.startDate > last) return null;
  const startCol = Math.max(0, diffDays(first, task.startDate));
  const endCol = Math.min(range.length - 1, diffDays(first, task.endDate));
  return {
    startCol,
    span: endCol - startCol + 1,
    clipStart: task.startDate < first,
    clipEnd: task.endDate > last,
  };
}
