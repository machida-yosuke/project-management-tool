import type { RichTextDoc } from './rich-text';

export const PROJECT_ROLES = ['admin', 'staff', 'substaff'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const TASK_STATUSES = ['open', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type LabelColor = string;
export const LABEL_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isLabelColor(value: unknown): value is LabelColor {
  return typeof value === 'string' && LABEL_COLOR_PATTERN.test(value);
}

export function normalizeLabelColor(value: string): LabelColor {
  return value.toLowerCase();
}

export const LABEL_COLOR_PRESETS: readonly LabelColor[] = [
  '#e5484d',
  '#f76b15',
  '#d4a017',
  '#30a46c',
  '#12a594',
  '#3e63dd',
  '#8e4ec6',
  '#8b8d98',
];
export const DEFAULT_LABEL_COLOR: LabelColor = '#8b8d98';

export const LABEL_NAME_MAX_LENGTH = 50;

export const DEFAULT_LABELS: readonly { name: string; color: LabelColor }[] = [
  { name: 'バグ報告', color: '#e5484d' },
  { name: '更新依頼', color: '#3e63dd' },
  { name: 'その他', color: '#8b8d98' },
];

export interface TaskLabel {
  id: string;
  projectId: string;
  name: string;
  color: LabelColor;
  createdAt: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: RichTextDoc;
  ownerId: string;
  role: ProjectRole;
  archivedAt: string | null;
  createdAt: string;
}

export interface ProjectMember {
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: ProjectRole;
  isOwner: boolean;
  createdAt: string;
}

export interface ProjectInvitation {
  id: string;
  projectId: string;
  projectName: string;
  email: string;
  role: ProjectRole;
  invitedBy: UserSummary;
  expiresAt: string;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: RichTextDoc;
  descriptionEditedAt: string | null;
  status: TaskStatus;
  assignee: UserSummary | null;
  startDate: string | null;
  endDate: string | null;
  label: TaskLabel | null;
  archivedAt: string | null;
  createdBy: UserSummary;
  createdAt: string;
  updatedAt: string;
}

export interface MyTask extends Task {
  project: { id: string; name: string };
}

export interface TaskComment {
  id: string;
  taskId: string;
  author: UserSummary;
  body: RichTextDoc;
  createdAt: string;
  editedAt: string | null;
}

export interface ApiError {
  error: string;
}

export interface AccountDeletionBlocked {
  error: 'owned_projects_have_members';
  projects: { id: string; name: string }[];
}

export function canEdit(role: ProjectRole): boolean {
  return role === 'admin' || role === 'staff';
}

export function canManageMembers(role: ProjectRole): boolean {
  return role === 'admin';
}
