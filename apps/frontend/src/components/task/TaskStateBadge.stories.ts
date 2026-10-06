import type { Meta, StoryObj } from '@storybook/vue3-vite';
import TaskStateBadge from './TaskStateBadge.vue';

const meta = {
  component: TaskStateBadge,
  args: { status: 'open' },
  argTypes: { status: { control: 'inline-radio', options: ['open', 'done'] } },
} satisfies Meta<typeof TaskStateBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
