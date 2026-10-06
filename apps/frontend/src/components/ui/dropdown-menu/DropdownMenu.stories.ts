import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { Button } from '../button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '.';

const components = {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
};

const meta = {
  // Auto-title keeps the kebab-case folder because it differs from the file name.
  title: 'components/ui/DropdownMenu',
  component: DropdownMenu,
  render: (args) => ({
    components,
    setup: () => ({ args }),
    template: `
      <DropdownMenu v-bind="args">
        <DropdownMenuTrigger as-child>
          <Button variant="outline">メニュー</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent class="w-48" align="start">
          <DropdownMenuLabel>アカウント</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem>設定<DropdownMenuShortcut>⌘,</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem disabled>請求</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">ログアウト</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    `,
  }),
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CheckboxAndRadio: Story = {
  render: (args) => ({
    components,
    setup: () => ({ args, showDone: ref(true), sort: ref('due') }),
    template: `
      <DropdownMenu v-bind="args">
        <DropdownMenuTrigger as-child>
          <Button variant="outline">表示</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent class="w-48" align="start">
          <DropdownMenuCheckboxItem v-model="showDone">完了したタスク</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>並び順</DropdownMenuLabel>
          <DropdownMenuRadioGroup v-model="sort">
            <DropdownMenuRadioItem value="due">期限</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="created">作成日</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    `,
  }),
};
