import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Button } from '../ui/button';
import PageHeader from './PageHeader.vue';

const meta = {
  component: PageHeader,
  args: { title: 'プロジェクト', description: '参加しているプロジェクトの一覧。' },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TitleOnly: Story = {
  args: { title: '設定', description: undefined },
};

export const WithActions: Story = {
  render: (args) => ({
    components: { Button, PageHeader },
    setup: () => ({ args }),
    template: `
      <PageHeader v-bind="args">
        <template #actions>
          <Button>新規プロジェクト</Button>
        </template>
      </PageHeader>
    `,
  }),
};

export const WithDefaultSlot: Story = {
  render: (args) => ({
    components: { PageHeader },
    setup: () => ({ args }),
    template: `
      <PageHeader v-bind="args">
        <p class="text-sm">説明の下に置く補足やフィルタ。</p>
      </PageHeader>
    `,
  }),
};
