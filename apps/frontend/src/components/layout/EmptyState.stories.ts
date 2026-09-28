import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Button } from '../ui/button';
import EmptyState from './EmptyState.vue';

const meta = {
  component: EmptyState,
  args: { message: 'まだタスクがない。' },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAction: Story = {
  args: { message: 'まだプロジェクトがない。' },
  render: (args) => ({
    components: { Button, EmptyState },
    setup: () => ({ args }),
    template: `
      <EmptyState v-bind="args">
        <Button size="sm">プロジェクトを作成</Button>
      </EmptyState>
    `,
  }),
};
