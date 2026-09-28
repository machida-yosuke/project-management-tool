import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Separator } from '.';

const meta = {
  component: Separator,
  args: { orientation: 'horizontal' },
  argTypes: {
    orientation: { control: 'select', options: ['horizontal', 'vertical'] },
  },
  render: (args) => ({
    components: { Separator },
    setup: () => ({ args }),
    template: `
      <div class="w-72 text-sm">
        <p>上のブロック</p>
        <Separator v-bind="args" class="my-4" />
        <p>下のブロック</p>
      </div>
    `,
  }),
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {};

export const Vertical: Story = {
  args: { orientation: 'vertical' },
  render: (args) => ({
    components: { Separator },
    setup: () => ({ args }),
    template: `
      <div class="flex h-5 items-center gap-4 text-sm">
        <span>タスク</span>
        <Separator v-bind="args" />
        <span>カレンダー</span>
        <Separator v-bind="args" />
        <span>メンバー</span>
      </div>
    `,
  }),
};
