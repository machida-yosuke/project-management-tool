import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import TaskFilterBar from './TaskFilterBar.vue';
import { DEFAULT_TASK_FILTERS, type TaskFilters, type TaskSort } from '../../lib/task-filters';

const meta = {
  component: TaskFilterBar,
  args: {
    filters: { ...DEFAULT_TASK_FILTERS },
    sort: 'created',
    members: [
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-bob', name: 'Bob' },
    ],
    labels: [
      { id: 'l1', name: 'バグ報告', color: '#e5484d' },
      { id: 'l2', name: '更新依頼', color: '#3e63dd' },
    ],
  },
  render: (args) => ({
    components: { TaskFilterBar },
    setup: () => {
      const filters = ref<TaskFilters>(args.filters);
      const sort = ref<TaskSort | undefined>(args.sort);
      return { args, filters, sort };
    },
    template: `
      <TaskFilterBar
        v-bind="args"
        v-model:filters="filters"
        v-model:sort="sort"
      />
    `,
  }),
} satisfies Meta<typeof TaskFilterBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Filtering: Story = {
  args: { filters: { assignee: 'u-bob', label: 'l1', due: 'overdue' }, sort: 'end' },
};

export const CalendarFilters: Story = {
  args: { sort: undefined, showDue: false },
};

export const Narrow: Story = {
  args: { filters: { assignee: 'none', label: 'none', due: 'week' } },
  decorators: [() => ({ template: '<div class="w-80 border p-2"><story /></div>' })],
};
