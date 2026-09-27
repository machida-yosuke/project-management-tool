import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import type { ProjectRole } from '@pm-tool/shared';
import { projectMembers, projects } from '../db/schema';
import { apiError } from './errors';

export interface Membership {
  projectId: string;
  userId: string;
  role: ProjectRole;
  isOwner: boolean;
}

export const EDITOR_ROLES = ['admin', 'staff'] as const satisfies readonly ProjectRole[];
export const MANAGER_ROLES = ['admin'] as const satisfies readonly ProjectRole[];

export async function loadMembership(
  db: D1Database,
  projectId: string,
  userId: string,
): Promise<Membership | null> {
  const rows = await drizzle(db)
    .select({ role: projectMembers.role, ownerId: projects.ownerId })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  const row = rows[0];
  if (!row) return null;
  return { projectId, userId, role: row.role, isOwner: row.ownerId === userId };
}

// Non-members get 404 so the project's existence is not leaked.
export async function requireMembership(
  db: D1Database,
  projectId: string,
  userId: string,
): Promise<Membership> {
  const membership = await loadMembership(db, projectId, userId);
  if (!membership) throw apiError(404, 'not_found');
  return membership;
}

export function assertRole(membership: Membership, allowed: readonly ProjectRole[]): void {
  if (!allowed.includes(membership.role)) throw apiError(403, 'forbidden');
}

export function assertOwner(membership: Membership): void {
  if (!membership.isOwner) throw apiError(403, 'forbidden');
}
