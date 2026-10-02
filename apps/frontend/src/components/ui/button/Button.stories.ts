import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Button } from '.';

const meta = {
  component: Button,
  args: { variant: 'default', size: 'default' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'],
    },
  },
  render: (args) => ({
    components: { Button },
    setup: () => ({ args }),
    template: '<Button v-bind="args">ボタン</Button>',
  }),
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => ({
    components: { Button },
    setup: () => ({
      args,
      variants: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const,
    }),
    template: `
      <div class="flex flex-wrap gap-2">
        <Button v-for="variant in variants" :key="variant" v-bind="args" :variant="variant">
          {{ variant }}
        </Button>
      </div>
    `,
  }),
};

export const Sizes: Story = {
  render: (args) => ({
    components: { Button },
    setup: () => ({ args, sizes: ['xs', 'sm', 'default', 'lg'] as const }),
    template: `
      <div class="flex flex-wrap items-center gap-2">
        <Button v-for="size in sizes" :key="size" v-bind="args" :size="size">{{ size }}</Button>
      </div>
    `,
  }),
};

export const Disabled: Story = {
  render: (args) => ({
    components: { Button },
    setup: () => ({ args }),
    template: '<Button v-bind="args" disabled>ボタン</Button>',
  }),
};
