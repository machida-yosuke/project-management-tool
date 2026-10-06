import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Button } from '../ui/button';
import TimelineItem from './TimelineItem.vue';

const meta = {
  component: TimelineItem,
  args: {
    author: { id: 'u-taro', name: 'Taro Yamada', avatarUrl: null },
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
} satisfies Meta<typeof TimelineItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithActions: Story = {
  render: (args) => ({
    components: { Button, TimelineItem },
    setup: () => ({ args }),
    template: `
      <TimelineItem v-bind="args">
        <template #meta><span class="text-muted-foreground">編集済み</span></template>
        <template #actions><Button variant="ghost" size="sm">編集</Button></template>
        <p>仕様を確認した。問題なさそう。</p>
      </TimelineItem>
    `,
  }),
};
