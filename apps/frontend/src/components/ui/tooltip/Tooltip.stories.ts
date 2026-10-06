import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Button } from '../button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '.';

const components = { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };

const meta = {
  title: 'UI/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components,
    template: `
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="outline">ホバー</Button>
          </TooltipTrigger>
          <TooltipContent>ツールチップの本文</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    `,
  }),
};
