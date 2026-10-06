import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { emptyRichTextDoc, plainTextToRichTextDoc } from '@pm-tool/shared';
import type { ProjectMember, Task } from '../../api/generated/models';
import ProjectOverview from './ProjectOverview.vue';

const NAMES = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本'];

function members(count: number): ProjectMember[] {
  return NAMES.slice(0, count).map((name, i) => ({
    userId: `u${i + 1}`,
    email: `user${i + 1}@example.com`,
    name,
    avatarUrl: null,
    role: i === 0 ? 'admin' : 'staff',
    isOwner: i === 0,
    createdAt: '2026-09-01T00:00:00.000Z',
  }));
}

function task(id: string, status: Task['status'], archivedAt: string | null = null): Task {
  return {
    id,
    projectId: 'p1',
    title: `タスク ${id}`,
    description: emptyRichTextDoc(),
    descriptionEditedAt: null,
    status,
    assignee: null,
    startDate: null,
    endDate: null,
    label: null,
    archivedAt,
    createdBy: { id: 'u1', email: 'user1@example.com', name: '佐藤', avatarUrl: null },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

const TASKS: Task[] = [
  task('t1', 'open'),
  task('t2', 'open'),
  task('t3', 'open'),
  task('t4', 'done'),
  task('t5', 'done', '2026-09-20T00:00:00.000Z'),
];

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

export const WithMembersAndTasks: Story = {
  args: { members: members(3), tasks: TASKS },
};

export const ManyMembers: Story = {
  args: { members: members(7), tasks: TASKS },
};

export const WithoutDescription: Story = {
  args: { project: { ...meta.args.project, description: emptyRichTextDoc() } },
};

export const Substaff: Story = {
  args: { project: { ...meta.args.project, role: 'substaff' } },
};

export const SubstaffWithoutDescription: Story = {
  args: { project: { ...meta.args.project, role: 'substaff', description: emptyRichTextDoc() } },
};

export const Archived: Story = {
  args: { project: { ...meta.args.project, archivedAt: '2026-09-20T00:00:00.000Z' } },
};
