import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { emptyRichTextDoc, plainTextToRichTextDoc } from '@pm-tool/shared';
import ProjectOverview from './ProjectOverview.vue';

const meta = {
  component: ProjectOverview,
  args: {
    project: {
      id: 'p1',
      name: '新規サービス開発',
      description: plainTextToRichTextDoc('来期リリース予定の新サービスの企画・開発を進める。'),
      ownerId: 'u1',
      role: 'admin',
      archivedAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
    },
  },
} satisfies Meta<typeof ProjectOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutDescription: Story = {
  args: { project: { ...meta.args.project, description: emptyRichTextDoc() } },
};

export const Substaff: Story = {
  args: { project: { ...meta.args.project, role: 'substaff' } },
};

export const Archived: Story = {
  args: { project: { ...meta.args.project, archivedAt: '2026-09-20T00:00:00.000Z' } },
};
