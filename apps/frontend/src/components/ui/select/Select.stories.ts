import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '.';

const components = {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};

const meta = {
  component: Select,
  args: { disabled: false },
  render: (args) => ({
    components,
    setup: () => ({ args, value: ref<string>() }),
    template: `
      <Select v-bind="args" v-model="value">
        <SelectTrigger class="w-48" aria-label="ステータス">
          <SelectValue placeholder="ステータスを選択" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todo">未着手</SelectItem>
          <SelectItem value="doing">進行中</SelectItem>
          <SelectItem value="done">完了</SelectItem>
          <SelectItem value="archived" disabled>アーカイブ</SelectItem>
        </SelectContent>
      </Select>
    `,
  }),
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};

export const SmallWithGroups: Story = {
  render: (args) => ({
    components,
    setup: () => ({ args, value: ref('member') }),
    template: `
      <Select v-bind="args" v-model="value">
        <SelectTrigger size="sm" class="w-40" aria-label="ロール">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>権限あり</SelectLabel>
            <SelectItem value="owner">オーナー</SelectItem>
            <SelectItem value="admin">管理者</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectItem value="member">メンバー</SelectItem>
        </SelectContent>
      </Select>
    `,
  }),
};
