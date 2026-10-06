import type { Meta, StoryObj } from '@storybook/vue3-vite';
import SidebarSection from './SidebarSection.vue';

const meta = {
  component: SidebarSection,
  args: { title: '担当者' },
} satisfies Meta<typeof SidebarSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { SidebarSection },
    setup: () => ({ args }),
    template: `
      <aside class="w-70 text-sm">
        <SidebarSection v-bind="args"><span class="text-muted-foreground">未割り当て</span></SidebarSection>
        <SidebarSection title="期間"><span class="text-muted-foreground">未設定</span></SidebarSection>
      </aside>
    `,
  }),
};
