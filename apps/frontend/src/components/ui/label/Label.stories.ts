import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Checkbox } from '../checkbox';
import { Input } from '../input';
import { Label } from '.';

const meta = {
  component: Label,
  render: (args) => ({
    components: { Input, Label },
    setup: () => ({ args }),
    template: `
      <div class="grid w-72 gap-2">
        <Label v-bind="args" for="label-story-name">プロジェクト名</Label>
        <Input id="label-story-name" placeholder="例: 新規サービス" />
      </div>
    `,
  }),
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithCheckbox: Story = {
  render: (args) => ({
    components: { Checkbox, Label },
    setup: () => ({ args }),
    template: `
      <div class="flex items-center gap-2">
        <Checkbox id="label-story-done" />
        <Label v-bind="args" for="label-story-done">完了したタスクを表示</Label>
      </div>
    `,
  }),
};
