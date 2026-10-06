import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Button } from '../button';
import { Input } from '../input';
import { Label } from '../label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '.';

const components = {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
};

const meta = {
  component: Dialog,
  render: (args) => ({
    components,
    setup: () => ({ args }),
    template: `
      <Dialog v-bind="args">
        <DialogTrigger as-child>
          <Button>メンバーを招待</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>メンバーを招待</DialogTitle>
            <DialogDescription>招待するユーザーのメールアドレスを入力する。</DialogDescription>
          </DialogHeader>
          <div class="grid gap-2">
            <Label for="dialog-story-email">メールアドレス</Label>
            <Input id="dialog-story-email" type="email" placeholder="user@example.com" />
          </div>
          <DialogFooter>
            <DialogClose as-child>
              <Button variant="outline">キャンセル</Button>
            </DialogClose>
            <Button>招待する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    `,
  }),
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Open: Story = {
  args: { defaultOpen: true },
};
