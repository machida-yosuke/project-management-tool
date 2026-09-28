import type { RichTextDoc } from './rich-text';

export const PROJECT_ROLES = ['admin', 'staff', 'substaff'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const TASK_STATUSES = ['open', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'gray',
] as const;
export type TaskColor = (typeof TASK_COLORS)[number];
export const DEFAULT_TASK_COLOR: TaskColor = 'gray';

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
  color: TaskColor;
  archivedAt: string | null;
  createdBy: UserSummary;
  createdAt: string;
  updatedAt: string;
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
