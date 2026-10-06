import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Button, buttonVariants } from '../button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '.';

const components = {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
};

const meta = {
  // Auto-title keeps the kebab-case folder because it differs from the file name.
  title: 'components/ui/AlertDialog',
  component: AlertDialog,
  render: (args) => ({
    components,
    setup: () => ({ args, destructiveClass: buttonVariants({ variant: 'destructive' }) }),
    template: `
      <AlertDialog v-bind="args">
        <AlertDialogTrigger as-child>
          <Button variant="destructive">プロジェクトを削除</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>プロジェクトを削除する？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せない。タスクとコメントもすべて削除される。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction :class="destructiveClass">削除する</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    `,
  }),
} satisfies Meta<typeof AlertDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Open: Story = {
  args: { defaultOpen: true },
};
