<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { Project } from '../../api/generated/models';
import { cn } from '../../lib/utils';

const props = defineProps<{ project: Project }>();

const route = useRoute();

const tabs = computed(() =>
  [
    { name: 'project', label: 'ホーム', routeNames: ['project'] },
    { name: 'project-tasks', label: 'タスク', routeNames: ['project-tasks', 'task'] },
    { name: 'project-calendar', label: 'カレンダー', routeNames: ['project-calendar'] },
    { name: 'project-manuals', label: 'マニュアル', routeNames: ['project-manuals', 'manual'] },
    { name: 'project-labels', label: 'ラベル', routeNames: ['project-labels'] },
    { name: 'project-members', label: 'メンバー', routeNames: ['project-members'] },
  ].map(({ routeNames, ...tab }) => ({
    ...tab,
    to: { name: tab.name, params: { projectId: props.project.id } },
    // Compared by route name because /projects/:id is a path prefix of every other tab.
    active: typeof route.name === 'string' && routeNames.includes(route.name),
  })),
);
</script>

<template>
  <div
    class="-mx-4 mb-6 min-w-0 overflow-x-auto border-b px-4 pb-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
  >
    <nav
      class="inline-flex w-max gap-1 rounded-lg bg-muted p-1 text-sm font-medium whitespace-nowrap"
      aria-label="プロジェクト"
    >
      <RouterLink
        v-for="tab in tabs"
        :key="tab.name"
        :to="tab.to"
        :aria-current="tab.active ? 'page' : undefined"
        :class="
          cn(
            'shrink-0 rounded-md px-3.5 py-1.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            tab.active
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )
        "
      >
        {{ tab.label }}
      </RouterLink>
    </nav>
  </div>
</template>
