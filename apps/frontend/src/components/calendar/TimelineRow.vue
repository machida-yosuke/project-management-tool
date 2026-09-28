<script setup lang="ts">
import type { Task } from '../../api/generated/models';
import type { DragMode } from '../../lib/calendar-drag';
import type { DateString } from '../../lib/dates';
import { TASK_COLOR_HEX } from '../../lib/task-colors';
import type { VisibleSpan } from '../../lib/timeline-layout';
import TaskBand from './TaskBand.vue';

defineProps<{
  task: Task;
  span: VisibleSpan | null;
  undated: boolean;
  days: { date: DateString; weekend: boolean; today: boolean }[];
  columnWidth: number;
  draggable: boolean;
  dragging: boolean;
  selected: boolean;
}>();

const emit = defineEmits<{
  grab: [event: PointerEvent, mode: DragMode];
  open: [];
}>();
</script>

<template>
  <div class="row" data-testid="task-row" :data-task-id="task.id">
    <button
      type="button"
      class="label"
      :class="{ selected, archived: task.archivedAt !== null }"
      data-testid="task-row-label"
      :title="task.title"
      @click="emit('open')"
    >
      <span class="dot" :style="{ backgroundColor: TASK_COLOR_HEX[task.color] }" />
      <span class="label-title">{{ task.title }}</span>
    </button>
    <div class="track">
      <div
        v-for="day in days"
        :key="day.date"
        class="cell"
        :class="{ weekend: day.weekend, today: day.today }"
      />
      <TaskBand
        v-if="span"
        :task="task"
        :segment="span"
        :column-width="columnWidth"
        :draggable="draggable"
        :dragging="dragging"
        :selected="selected"
        @grab="(event, mode) => emit('grab', event, mode)"
        @open="emit('open')"
      />
      <span v-else-if="undated" class="undated" data-testid="undated">日付未設定</span>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  width: max-content;
  min-width: 100%;
  height: 32px;
  border-bottom: 1px solid #eee;
}

.row:last-child {
  border-bottom: none;
}

.label {
  position: sticky;
  left: 0;
  z-index: 2;
  box-sizing: border-box;
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  width: var(--label-width);
  padding: 0 8px;
  border: none;
  border-right: 1px solid #ddd;
  border-radius: 0;
  background: #fff;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.label:hover,
.label.selected {
  background: #eef2ff;
}

.label.archived {
  color: #888;
}

.dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.label-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track {
  position: relative;
  display: flex;
  flex: none;
}

.cell {
  box-sizing: border-box;
  flex: none;
  width: var(--column-width);
  border-left: 1px solid #f0f0f0;
}

.cell.weekend {
  background: #f7f7f7;
}

.cell.today {
  background: #e0e7ff;
}

.undated {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 8px;
  display: flex;
  align-items: center;
  color: #aaa;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}
</style>
