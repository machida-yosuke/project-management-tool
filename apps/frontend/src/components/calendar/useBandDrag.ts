import { onScopeDispose, ref, type Ref } from 'vue';
import type { DatedTask } from '../../lib/timeline-layout';
import {
  computeDragDates,
  dateAtX,
  exceedsThreshold,
  type DayCellRect,
  type DragMode,
} from '../../lib/calendar-drag';
import type { DateString } from '../../lib/dates';

export const LONG_PRESS_MS = 300;

export interface DragState {
  taskId: string;
  mode: DragMode;
  pointerId: number;
  originX: number;
  originY: number;
  draggable: boolean;
  moved: boolean;
  longPressed: boolean;
  originalStart: DateString;
  originalEnd: DateString;
  anchorDate: DateString;
  previewStart: DateString;
  previewEnd: DateString;
}

interface PendingPress {
  task: DatedTask;
  mode: DragMode;
  pointerId: number;
  originX: number;
  originY: number;
  timer: number | null;
}

function preventTouchScroll(event: TouchEvent) {
  event.preventDefault();
}

export function useBandDrag(options: {
  editable: (taskId: string) => boolean;
  measureCells: (root: Element | null) => DayCellRect[];
  gridElement: Ref<HTMLElement | null>;
  onOpen: (taskId: string) => void;
  onCommit: (taskId: string, startDate: DateString, endDate: DateString) => void;
}) {
  const drag = ref<DragState | null>(null);
  let pending: PendingPress | null = null;
  let scrollLockTarget: EventTarget | null = null;

  function currentDrag(event: PointerEvent): DragState | null {
    const state = drag.value;
    return state && state.pointerId === event.pointerId ? state : null;
  }

  function currentPending(event: PointerEvent): PendingPress | null {
    return pending && pending.pointerId === event.pointerId ? pending : null;
  }

  function clearPending() {
    if (pending?.timer != null) window.clearTimeout(pending.timer);
    pending = null;
  }

  // touch-action has to allow panning so the calendar scrolls, so once a long press turns
  // into a drag the only way to stop the page from scrolling under the finger is a
  // non-passive touchmove listener.
  function lockScroll() {
    unlockScroll();
    scrollLockTarget = options.gridElement.value ?? document;
    scrollLockTarget.addEventListener('touchmove', preventTouchScroll as EventListener, {
      passive: false,
    });
  }

  function unlockScroll() {
    scrollLockTarget?.removeEventListener('touchmove', preventTouchScroll as EventListener);
    scrollLockTarget = null;
  }

  function endDrag() {
    drag.value = null;
    unlockScroll();
  }

  function startDrag(
    task: DatedTask,
    mode: DragMode,
    pointerId: number,
    originX: number,
    originY: number,
    longPressed: boolean,
  ) {
    const draggable = options.editable(task.id);
    const grid = options.gridElement.value;
    const cells = options.measureCells(grid);
    drag.value = {
      taskId: task.id,
      mode: draggable ? mode : 'move',
      pointerId,
      originX,
      originY,
      draggable,
      moved: false,
      longPressed,
      originalStart: task.startDate,
      originalEnd: task.endDate,
      anchorDate: dateAtX(cells, originX) ?? task.startDate,
      previewStart: task.startDate,
      previewEnd: task.endDate,
    };
    // Captured on the grid so moves keep arriving once the pointer leaves the band.
    if (grid && 'setPointerCapture' in grid) grid.setPointerCapture(pointerId);
  }

  function onPointerDown(event: PointerEvent, task: DatedTask, mode: DragMode) {
    if (event.button !== 0) return;
    clearPending();
    if (event.pointerType !== 'touch') {
      startDrag(task, mode, event.pointerId, event.clientX, event.clientY, false);
      return;
    }
    const press: PendingPress = {
      task,
      mode,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      timer: null,
    };
    // Read-only bands have nothing to drag, so a touch on them only ever scrolls or taps.
    if (options.editable(task.id)) {
      press.timer = window.setTimeout(() => {
        if (pending !== press) return;
        pending = null;
        startDrag(press.task, press.mode, press.pointerId, press.originX, press.originY, true);
        lockScroll();
      }, LONG_PRESS_MS);
    }
    pending = press;
  }

  function onPointerMove(event: PointerEvent) {
    const press = currentPending(event);
    if (press) {
      if (
        exceedsThreshold(
          { x: press.originX, y: press.originY },
          { x: event.clientX, y: event.clientY },
        )
      ) {
        clearPending();
      }
      return;
    }
    const state = currentDrag(event);
    if (!state) return;
    if (!state.moved) {
      if (
        !exceedsThreshold(
          { x: state.originX, y: state.originY },
          { x: event.clientX, y: event.clientY },
        )
      ) {
        return;
      }
      state.moved = true;
    }
    if (!state.draggable) return;
    const currentDate = dateAtX(options.measureCells(options.gridElement.value), event.clientX);
    if (currentDate === null) return;
    const next = computeDragDates({
      mode: state.mode,
      originalStart: state.originalStart,
      originalEnd: state.originalEnd,
      anchorDate: state.anchorDate,
      currentDate,
    });
    state.previewStart = next.startDate;
    state.previewEnd = next.endDate;
  }

  function onPointerUp(event: PointerEvent) {
    const press = currentPending(event);
    if (press) {
      clearPending();
      options.onOpen(press.task.id);
      return;
    }
    const state = currentDrag(event);
    if (!state) return;
    endDrag();
    if (!state.moved) {
      // A long press is a deliberate drag gesture; opening the task on release would be a surprise.
      if (!state.longPressed) options.onOpen(state.taskId);
      return;
    }
    // Read-only users have nothing a drag could mean, so any release on their band opens it.
    if (!state.draggable) {
      options.onOpen(state.taskId);
      return;
    }
    if (state.previewStart !== state.originalStart || state.previewEnd !== state.originalEnd) {
      options.onCommit(state.taskId, state.previewStart, state.previewEnd);
    }
  }

  function onPointerCancel(event: PointerEvent) {
    if (currentPending(event)) clearPending();
    if (currentDrag(event)) endDrag();
  }

  onScopeDispose(() => {
    clearPending();
    unlockScroll();
  });

  return { drag, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
