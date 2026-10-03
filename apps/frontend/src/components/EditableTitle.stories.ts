import type { Meta, StoryObj } from '@storybook/vue3-vite';
import EditableTitle from './EditableTitle.vue';

const meta = {
  component: EditableTitle,
  args: {
    title: 'オンボーディング手順',
    editable: true,
    save: () => new Promise((resolve) => setTimeout(resolve, 500)),
  },
} satisfies Meta<typeof EditableTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {};

export const ReadOnly: Story = {
  args: { editable: false },
};

export const SaveError: Story = {
  args: {
    save: () => Promise.reject(new Error('failed')),
  },
};
