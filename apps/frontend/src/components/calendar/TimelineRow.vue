<script setup lang="ts">
import { DEFAULT_LABEL_COLOR } from '@pm-tool/shared';
import type { Task } from '../../api/generated/models';
import type { DragMode } from '../../lib/calendar-drag';
import type { DateString } from '../../lib/dates';
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
}>();

const emit = defineEmits<{
  grab: [event: PointerEvent, mode: DragMode];
  open: [];
}>();
</script>

<template>
  <div
    class="flex h-8 w-max min-w-full border-b border-border/60 last:border-b-0"
    data-testid="task-row"
    :data-task-id="task.id"
  >
    <button
      type="button"
      class="sticky left-0 z-2 flex w-(--label-width) flex-none cursor-pointer items-center gap-1.5 border-r border-border px-2 text-left text-[13px] bg-background hover:bg-accent"
      :class="{ 'text-muted-foreground': task.archivedAt !== null }"
      data-testid="task-row-label"
      :title="task.title"
      @click="emit('open')"
    >
      <span
        class="size-2.5 flex-none rounded-full"
        :style="{ backgroundColor: task.label?.color ?? DEFAULT_LABEL_COLOR }"
      />
      <span class="min-w-0 truncate">{{ task.title }}</span>
    </button>
    <div class="relative flex flex-none">
      <div
        v-for="day in days"
        :key="day.date"
        class="w-(--column-width) flex-none border-l border-border/40"
        :class="day.today ? 'bg-primary/10' : day.weekend ? 'bg-muted/60' : ''"
      />
      <TaskBand
        v-if="span"
        :task="task"
        :segment="span"
        :column-width="columnWidth"
        :draggable="draggable"
        :dragging="dragging"
        @grab="(event, mode) => emit('grab', event, mode)"
        @open="emit('open')"
      />
      <span
        v-else-if="undated"
        class="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs whitespace-nowrap text-muted-foreground/70"
        data-testid="undated"
        >日付未設定</span
      >
    </div>
  </div>
</template>
