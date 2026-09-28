import type { InjectionKey } from 'vue';
import { addDays, diffDays, type DateString } from './dates';

export interface Rect {
  left: number;
  right: number;
}

export interface DayCellRect {
  date: DateString;
  rect: Rect;
}

export interface DateRange {
  startDate: DateString;
  endDate: DateString;
}

export type DragMode = 'move' | 'start' | 'end';

export interface Point {
  x: number;
  y: number;
}

export const DRAG_THRESHOLD_PX = 4;

export function dateAtX(cells: readonly DayCellRect[], x: number): DateString | null {
  return cells.find(({ rect }) => x >= rect.left && x < rect.right)?.date ?? null;
}

export function computeDragDates(input: {
  mode: DragMode;
  originalStart: DateString;
  originalEnd: DateString;
  anchorDate: DateString;
  currentDate: DateString;
}): DateRange {
  const delta = diffDays(input.anchorDate, input.currentDate);
  const { originalStart, originalEnd } = input;
  switch (input.mode) {
    case 'move':
      return { startDate: addDays(originalStart, delta), endDate: addDays(originalEnd, delta) };
    case 'start': {
      const moved = addDays(originalStart, delta);
      return { startDate: moved > originalEnd ? originalEnd : moved, endDate: originalEnd };
    }
    case 'end': {
      const moved = addDays(originalEnd, delta);
      return { startDate: originalStart, endDate: moved < originalStart ? originalStart : moved };
    }
  }
}

export function exceedsThreshold(origin: Point, point: Point): boolean {
  return Math.hypot(point.x - origin.x, point.y - origin.y) >= DRAG_THRESHOLD_PX;
}

export function measureDayCells(root: Element | null): DayCellRect[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll('[data-date]'), (element) => {
    const { left, right } = element.getBoundingClientRect();
    return { date: element.getAttribute('data-date') ?? '', rect: { left, right } };
  }).filter((cell) => cell.date !== '');
}

// Injected so tests can supply fixed geometry; happy-dom reports every rect as zero.
export const MEASURE_CELLS_KEY: InjectionKey<(root: Element | null) => DayCellRect[]> =
  Symbol('measureCells');
