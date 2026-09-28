import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { emptyRichTextDoc, plainTextToRichTextDoc } from '@pm-tool/shared';
import ProjectHeader from './ProjectHeader.vue';

const meta = {
  component: ProjectHeader,
  args: {
    project: {
      id: 'p1',
      name: '新規サービス開発',
      description: plainTextToRichTextDoc('来期リリース予定の新サービスの企画・開発を進める。'),
      ownerId: 'u1',
      role: 'admin',
      createdAt: '2026-09-01T00:00:00.000Z',
    },
  },
  parameters: { route: '/projects/p1' },
} satisfies Meta<typeof ProjectHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {};

export const WithoutDescription: Story = {
  args: { project: { ...meta.args.project, description: emptyRichTextDoc() } },
};

export const Substaff: Story = {
  args: { project: { ...meta.args.project, role: 'substaff' } },
};

export const Tasks: Story = {
  parameters: { route: '/projects/p1/tasks' },
};

export const Calendar: Story = {
  parameters: { route: '/projects/p1/calendar' },
};

export const Members: Story = {
  parameters: { route: '/projects/p1/members' },
};
