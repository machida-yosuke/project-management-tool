import { ref, type Ref } from 'vue';
import type { DatedTask } from '../../lib/timeline-layout';
import {
  computeDragDates,
  dateAtX,
  exceedsThreshold,
  type DayCellRect,
  type DragMode,
} from '../../lib/calendar-drag';
import type { DateString } from '../../lib/dates';

export interface DragState {
  taskId: string;
  mode: DragMode;
  pointerId: number;
  originX: number;
  originY: number;
  draggable: boolean;
  moved: boolean;
  originalStart: DateString;
  originalEnd: DateString;
  anchorDate: DateString;
  previewStart: DateString;
  previewEnd: DateString;
}

export function useBandDrag(options: {
  editable: (taskId: string) => boolean;
  measureCells: (root: Element | null) => DayCellRect[];
  gridElement: Ref<HTMLElement | null>;
  onOpen: (taskId: string) => void;
  onCommit: (taskId: string, startDate: DateString, endDate: DateString) => void;
}) {
  const drag = ref<DragState | null>(null);

  function currentDrag(event: PointerEvent): DragState | null {
    const state = drag.value;
    return state && state.pointerId === event.pointerId ? state : null;
  }

  function onPointerDown(event: PointerEvent, task: DatedTask, mode: DragMode) {
    if (event.button !== 0) return;
    const draggable = options.editable(task.id);
    const grid = options.gridElement.value;
    const cells = options.measureCells(grid);
    drag.value = {
      taskId: task.id,
      mode: draggable ? mode : 'move',
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      draggable,
      moved: false,
      originalStart: task.startDate,
      originalEnd: task.endDate,
      anchorDate: dateAtX(cells, event.clientX) ?? task.startDate,
      previewStart: task.startDate,
      previewEnd: task.endDate,
    };
    // Captured on the grid so moves keep arriving once the pointer leaves the band.
    if (grid && 'setPointerCapture' in grid) grid.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
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
    const state = currentDrag(event);
    if (!state) return;
    drag.value = null;
    // Read-only users have nothing a drag could mean, so any release on their band opens it.
    if (!state.moved || !state.draggable) {
      options.onOpen(state.taskId);
      return;
    }
    if (state.previewStart !== state.originalStart || state.previewEnd !== state.originalEnd) {
      options.onCommit(state.taskId, state.previewStart, state.previewEnd);
    }
  }

  function onPointerCancel(event: PointerEvent) {
    if (currentDrag(event)) drag.value = null;
  }

  return { drag, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
