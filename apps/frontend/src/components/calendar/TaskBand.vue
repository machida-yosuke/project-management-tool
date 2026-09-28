<script setup lang="ts">
import { computed } from 'vue';
import type { Task } from '../../api/generated/models';
import type { DragMode } from '../../lib/calendar-drag';
import { TASK_COLOR_HEX } from '../../lib/task-colors';
import type { VisibleSpan } from '../../lib/timeline-layout';

const props = defineProps<{
  task: Task;
  segment: VisibleSpan;
  columnWidth: number;
  draggable: boolean;
  dragging: boolean;
  selected: boolean;
}>();

const emit = defineEmits<{
  grab: [event: PointerEvent, mode: DragMode];
  open: [];
}>();

const style = computed(() => ({
  left: `${props.segment.startCol * props.columnWidth}px`,
  width: `${props.segment.span * props.columnWidth}px`,
  backgroundColor: TASK_COLOR_HEX[props.task.color],
}));
</script>

<template>
  <div
    class="band"
    :class="{
      done: task.status === 'done',
      archived: task.archivedAt !== null,
      dragging,
      selected,
      'clip-start': segment.clipStart,
      'clip-end': segment.clipEnd,
    }"
    :style="style"
    data-testid="band"
    :data-task-id="task.id"
    role="button"
    tabindex="0"
    :title="task.title"
    @pointerdown="emit('grab', $event, 'move')"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <span
      v-if="draggable && !segment.clipStart"
      class="handle handle-start"
      data-testid="handle-start"
      @pointerdown.stop="emit('grab', $event, 'start')"
    />
    <span class="title">{{ task.title }}</span>
    <span
      v-if="draggable && !segment.clipEnd"
      class="handle handle-end"
      data-testid="handle-end"
      @pointerdown.stop="emit('grab', $event, 'end')"
    />
  </div>
</template>

<style scoped>
.band {
  position: absolute;
  top: 4px;
  bottom: 4px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  overflow: hidden;
  border: 1px solid transparent;
  background-clip: padding-box;
}

.band:focus-visible,
.band.selected {
  outline: 2px solid #1d4ed8;
  outline-offset: 1px;
}

.band.clip-start {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.band.clip-end {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.band.done {
  opacity: 0.5;
}

.band.done .title {
  text-decoration: line-through;
}

.band.archived {
  opacity: 0.45;
  cursor: default;
  background-image: repeating-linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.45) 0,
    rgba(255, 255, 255, 0.45) 4px,
    transparent 4px,
    transparent 8px
  );
}

.band.dragging {
  opacity: 0.85;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  z-index: 1;
}

.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
}

.handle-start {
  left: 0;
}

.handle-end {
  right: 0;
}
</style>
