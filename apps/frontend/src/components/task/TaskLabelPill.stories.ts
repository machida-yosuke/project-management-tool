import type { Meta, StoryObj } from '@storybook/vue3-vite';
import TaskLabelPill from './TaskLabelPill.vue';

const meta = {
  component: TaskLabelPill,
  args: {
    label: {
      name: 'バグ報告',
      color: '#e5484d',
    },
  },
} satisfies Meta<typeof TaskLabelPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongName: Story = {
  args: {
    label: {
      ...meta.args.label,
      name: 'とても長いラベル名がピルの幅を超えたときの表示',
      color: '#3e63dd',
    },
  },
};

export const CustomColor: Story = {
  args: {
    label: {
      ...meta.args.label,
      name: 'カスタム',
      color: '#ff00aa',
    },
  },
};
