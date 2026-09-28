import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Badge } from '.';

const meta = {
  component: Badge,
  args: { variant: 'default' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline', 'success', 'warning', 'info'],
    },
  },
  render: (args) => ({
    components: { Badge },
    setup: () => ({ args }),
    template: '<Badge v-bind="args">進行中</Badge>',
  }),
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => ({
    components: { Badge },
    setup: () => ({
      args,
      variants: [
        'default',
        'secondary',
        'destructive',
        'outline',
        'success',
        'warning',
        'info',
      ] as const,
    }),
    template: `
      <div class="flex flex-wrap gap-2">
        <Badge v-for="variant in variants" :key="variant" v-bind="args" :variant="variant">
          {{ variant }}
        </Badge>
      </div>
    `,
  }),
};
