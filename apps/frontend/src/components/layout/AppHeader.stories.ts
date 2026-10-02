import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AppHeader from './AppHeader.vue';

const meta = {
  component: AppHeader,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AppHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Authenticated: Story = {
  parameters: {
    authUser: { id: 'u1', email: 'yamada@example.com', name: '山田 太郎', avatarUrl: null },
  },
};

export const Unauthenticated: Story = {};
