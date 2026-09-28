import type { Meta, StoryObj } from '@storybook/vue3-vite';
import TaskStateIcon from './TaskStateIcon.vue';

const meta = {
  component: TaskStateIcon,
  args: { status: 'open' },
  argTypes: { status: { control: 'inline-radio', options: ['open', 'done'] } },
} satisfies Meta<typeof TaskStateIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
