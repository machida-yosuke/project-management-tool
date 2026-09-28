import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { CircleAlert, Info } from '@lucide/vue';
import { Alert, AlertDescription, AlertTitle } from '.';

const components = { Alert, AlertDescription, AlertTitle, CircleAlert, Info };

const meta = {
  component: Alert,
  args: { variant: 'default' },
  argTypes: {
    variant: { control: 'select', options: ['default', 'destructive'] },
  },
  render: (args) => ({
    components,
    setup: () => ({ args }),
    template: `
      <Alert v-bind="args" class="w-96">
        <Info />
        <AlertTitle>お知らせ</AlertTitle>
        <AlertDescription>招待したメンバーはまだ参加していない。</AlertDescription>
      </Alert>
    `,
  }),
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Destructive: Story = {
  args: { variant: 'destructive' },
  render: (args) => ({
    components,
    setup: () => ({ args }),
    template: `
      <Alert v-bind="args" class="w-96">
        <CircleAlert />
        <AlertTitle>読み込みに失敗した</AlertTitle>
        <AlertDescription>時間をおいて再度試してほしい。</AlertDescription>
      </Alert>
    `,
  }),
};

export const TitleOnly: Story = {
  render: (args) => ({
    components,
    setup: () => ({ args }),
    template: '<Alert v-bind="args" class="w-96"><AlertTitle>保存した</AlertTitle></Alert>',
  }),
};
