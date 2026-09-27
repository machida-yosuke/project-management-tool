export const PROJECT_ROLES = ['admin', 'staff', 'substaff'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const TASK_STATUSES = ['open', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface UserSummary {
  id: string;
  email: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  role: ProjectRole;
  createdAt: string;
}

export interface ProjectMember {
  userId: string;
  email: string;
  name: string;
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
  description: string;
  status: TaskStatus;
  assignee: UserSummary | null;
  createdBy: UserSummary;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  author: UserSummary;
  body: string;
  createdAt: string;
}

export interface ApiError {
  error: string;
}

export function canEdit(role: ProjectRole): boolean {
  return role === 'admin' || role === 'staff';
}

export function canManageMembers(role: ProjectRole): boolean {
  return role === 'admin';
}
