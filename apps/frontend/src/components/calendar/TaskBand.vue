<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_LABEL_COLOR } from '@pm-tool/shared';
import type { Task } from '../../api/generated/models';
import type { DragMode } from '../../lib/calendar-drag';
import type { VisibleSpan } from '../../lib/timeline-layout';
import { cn } from '../../lib/utils';

const props = defineProps<{
  task: Task;
  segment: VisibleSpan;
  columnWidth: number;
  draggable: boolean;
  dragging: boolean;
}>();

const emit = defineEmits<{
  grab: [event: PointerEvent, mode: DragMode];
  open: [];
}>();

const style = computed(() => ({
  left: `${props.segment.startCol * props.columnWidth}px`,
  width: `${props.segment.span * props.columnWidth}px`,
  backgroundColor: props.task.label?.color ?? DEFAULT_LABEL_COLOR,
}));

const bandClass = computed(() => {
  const done = props.task.status === 'done';
  const archived = props.task.archivedAt !== null;
  return cn(
    // Plain state classes stay as markers that tests assert on.
    {
      done,
      archived,
      dragging: props.dragging,
      'clip-start': props.segment.clipStart,
      'clip-end': props.segment.clipEnd,
    },
    'pointer-events-auto absolute inset-y-1 flex cursor-pointer touch-manipulation items-center overflow-hidden rounded-[4px] border border-transparent bg-clip-padding px-2 text-xs leading-none text-white select-none',
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
    props.segment.clipStart && 'rounded-l-none',
    props.segment.clipEnd && 'rounded-r-none',
    done && 'opacity-50',
    archived &&
      'cursor-default bg-[image:repeating-linear-gradient(45deg,rgba(255,255,255,0.45)_0,rgba(255,255,255,0.45)_4px,transparent_4px,transparent_8px)] opacity-45',
    props.dragging && 'z-1 shadow-[0_2px_6px_rgba(0,0,0,0.3)] opacity-85',
  );
});
</script>

<template>
  <div
    :class="bandClass"
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
      class="absolute inset-y-0 left-0 w-2 cursor-ew-resize pointer-coarse:w-4"
      data-testid="handle-start"
      @pointerdown.stop="emit('grab', $event, 'start')"
    />
    <span class="min-w-0 flex-1 truncate" :class="{ 'line-through': task.status === 'done' }">
      {{ task.title }}
    </span>
    <span
      v-if="draggable && !segment.clipEnd"
      class="absolute inset-y-0 right-0 w-2 cursor-ew-resize pointer-coarse:w-4"
      data-testid="handle-end"
      @pointerdown.stop="emit('grab', $event, 'end')"
    />
  </div>
</template>
