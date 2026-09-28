<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { Task } from '../../api/generated/models';
import {
  MEASURE_CELLS_KEY,
  measureDayCells,
  type DateRange,
  type DragMode,
} from '../../lib/calendar-drag';
import { formatShortDay, mondayIndex, WEEKDAY_LABELS, type DateString } from '../../lib/dates';
import { visibleSpan, type DatedTask } from '../../lib/timeline-layout';
import TimelineRow from './TimelineRow.vue';
import { useBandDrag } from './useBandDrag';

const props = defineProps<{
  dates: DateString[];
  tasks: Task[];
  editable: boolean;
  today: DateString;
  selectedTaskId: string | null;
  dateOverrides: Record<string, DateRange>;
  columnWidth: number;
}>();

const emit = defineEmits<{
  open: [taskId: string];
  commit: [payload: { taskId: string } & DateRange];
}>();

const gridElement = ref<HTMLElement | null>(null);
const measureCells = inject(MEASURE_CELLS_KEY, measureDayCells);

const tasksById = computed(() => new Map(props.tasks.map((task) => [task.id, task])));

function isDraggable(task: Task) {
  return props.editable && task.archivedAt === null;
}

const { drag, onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = useBandDrag({
  editable: (taskId) => {
    const task = tasksById.value.get(taskId);
    return task ? isDraggable(task) : false;
  },
  measureCells,
  gridElement,
  onOpen: (taskId) => emit('open', taskId),
  onCommit: (taskId, startDate, endDate) => emit('commit', { taskId, startDate, endDate }),
});

function effectiveDates(task: Task): DatedTask | null {
  const state = drag.value;
  if (state && state.taskId === task.id && state.moved && state.draggable) {
    return { id: task.id, startDate: state.previewStart, endDate: state.previewEnd };
  }
  const override = props.dateOverrides[task.id];
  if (override) return { id: task.id, ...override };
  if (task.startDate === null || task.endDate === null) return null;
  return { id: task.id, startDate: task.startDate, endDate: task.endDate };
}

const rows = computed(() =>
  props.tasks.map((task) => {
    const dated = effectiveDates(task);
    return { task, dated, span: dated ? visibleSpan(dated, props.dates) : null };
  }),
);

const days = computed(() =>
  props.dates.map((date) => {
    const weekday = mondayIndex(date);
    return {
      date,
      label: formatShortDay(date),
      weekday: WEEKDAY_LABELS[weekday],
      weekend: weekday >= 5,
      today: date === props.today,
    };
  }),
);

const draggingTaskId = computed(() => {
  const state = drag.value;
  return state && state.moved && state.draggable ? state.taskId : null;
});

function grab(event: PointerEvent, task: Task, mode: DragMode) {
  const dated = effectiveDates(task);
  if (dated) onPointerDown(event, dated, mode);
}
</script>

<template>
  <div
    ref="gridElement"
    class="timeline"
    data-testid="timeline-grid"
    :style="{ '--column-width': `${columnWidth}px` }"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @lostpointercapture="onPointerCancel"
  >
    <div class="header">
      <div class="corner">タスク</div>
      <div
        v-for="day in days"
        :key="day.date"
        class="day"
        :class="{ weekend: day.weekend, today: day.today }"
        :data-date="day.date"
      >
        <span class="day-label">{{ day.label }}</span>
        <span class="weekday">{{ day.weekday }}</span>
      </div>
    </div>
    <TimelineRow
      v-for="row in rows"
      :key="row.task.id"
      :task="row.task"
      :span="row.span"
      :undated="row.dated === null"
      :days="days"
      :column-width="columnWidth"
      :draggable="isDraggable(row.task)"
      :dragging="draggingTaskId === row.task.id"
      :selected="selectedTaskId === row.task.id"
      @grab="(event, mode) => grab(event, row.task, mode)"
      @open="emit('open', row.task.id)"
    />
  </div>
</template>

<style scoped>
.timeline {
  --label-width: 200px;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow-x: auto;
}

.header {
  display: flex;
  width: max-content;
  min-width: 100%;
  border-bottom: 1px solid #ddd;
  background: #f5f5f5;
  font-size: 12px;
}

.corner {
  position: sticky;
  left: 0;
  z-index: 2;
  box-sizing: border-box;
  flex: none;
  width: var(--label-width);
  padding: 4px 8px;
  border-right: 1px solid #ddd;
  background: #f5f5f5;
  font-weight: bold;
}

.day {
  box-sizing: border-box;
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  width: var(--column-width);
  padding: 2px 0;
  border-left: 1px solid #eee;
  line-height: 1.3;
}

.day.weekend {
  background: #ececec;
  color: #777;
}

.day.today {
  background: #1d4ed8;
  color: #fff;
  font-weight: bold;
}

.weekday {
  font-size: 11px;
}
</style>
