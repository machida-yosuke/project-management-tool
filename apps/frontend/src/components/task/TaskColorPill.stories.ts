import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { TASK_COLORS } from '@pm-tool/shared';
import TaskColorPill from './TaskColorPill.vue';

const meta = {
  component: TaskColorPill,
  args: { color: 'blue' },
  argTypes: { color: { control: 'select', options: TASK_COLORS } },
} satisfies Meta<typeof TaskColorPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Blue: Story = {};
