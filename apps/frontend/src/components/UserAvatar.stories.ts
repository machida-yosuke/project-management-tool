import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UserAvatar from './UserAvatar.vue';

const meta = {
  component: UserAvatar,
  args: { name: 'Taro Yamada', avatarUrl: null, size: 24 },
} satisfies Meta<typeof UserAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initial: Story = {};

export const Large: Story = {
  args: { size: 48 },
};
