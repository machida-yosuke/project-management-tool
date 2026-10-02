import type { Meta, StoryObj } from '@storybook/vue3-vite';
import RelativeTime from './RelativeTime.vue';

const meta = {
  component: RelativeTime,
  args: { datetime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
} satisfies Meta<typeof RelativeTime>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DaysAgo: Story = {};
