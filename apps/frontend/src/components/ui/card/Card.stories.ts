import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Button } from '../button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '.';

const components = {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};

const meta = {
  component: Card,
  render: (args) => ({
    components,
    setup: () => ({ args }),
    template: `
      <Card v-bind="args" class="w-96">
        <CardHeader>
          <CardTitle>プロジェクト A</CardTitle>
          <CardDescription>四半期のリリースに向けたタスクをまとめる。</CardDescription>
        </CardHeader>
        <CardContent>
          <p class="text-sm">未完了のタスクが 3 件ある。</p>
        </CardContent>
      </Card>
    `,
  }),
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithActionAndFooter: Story = {
  render: (args) => ({
    components,
    setup: () => ({ args }),
    template: `
      <Card v-bind="args" class="w-96">
        <CardHeader>
          <CardTitle>プロジェクト A</CardTitle>
          <CardDescription>四半期のリリースに向けたタスクをまとめる。</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm">編集</Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p class="text-sm">未完了のタスクが 3 件ある。</p>
        </CardContent>
        <CardFooter class="justify-end gap-2">
          <Button variant="outline">キャンセル</Button>
          <Button>保存</Button>
        </CardFooter>
      </Card>
    `,
  }),
};
