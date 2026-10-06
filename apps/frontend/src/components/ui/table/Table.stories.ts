import type { Meta, StoryObj } from '@storybook/vue3-vite';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '.';

const components = {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
};

const members = [
  { id: 1, name: '山田 太郎', email: 'yamada@example.com', role: 'オーナー' },
  { id: 2, name: '佐藤 花子', email: 'sato@example.com', role: '管理者' },
  { id: 3, name: '鈴木 一郎', email: 'suzuki@example.com', role: 'メンバー' },
];

const meta = {
  component: Table,
  render: (args) => ({
    components,
    setup: () => ({ args, members }),
    template: `
      <Table v-bind="args">
        <TableCaption>プロジェクトのメンバー</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>名前</TableHead>
            <TableHead>メールアドレス</TableHead>
            <TableHead class="text-right">ロール</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="member in members" :key="member.id">
            <TableCell class="font-medium">{{ member.name }}</TableCell>
            <TableCell>{{ member.email }}</TableCell>
            <TableCell class="text-right">{{ member.role }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    `,
  }),
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  render: (args) => ({
    components,
    setup: () => ({ args }),
    template: `
      <Table v-bind="args">
        <TableHeader>
          <TableRow>
            <TableHead>名前</TableHead>
            <TableHead>メールアドレス</TableHead>
            <TableHead>ロール</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableEmpty :colspan="3">メンバーがいない</TableEmpty>
        </TableBody>
      </Table>
    `,
  }),
};
