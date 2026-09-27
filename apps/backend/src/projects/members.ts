import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import type { ProjectMember, ProjectRole } from '@pm-tool/shared';
import { projectMembers, projects, tasks, users } from '../db/schema';
import { avatarUrlFor } from '../users/avatar';
import { apiError } from './errors';

function memberQuery(db: D1Database) {
  return drizzle(db)
    .select({
      userId: projectMembers.userId,
      email: users.email,
      name: users.name,
      avatarKey: users.avatarKey,
      role: projectMembers.role,
      ownerId: projects.ownerId,
      createdAt: projectMembers.createdAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .innerJoin(projects, eq(projects.id, projectMembers.projectId));
}

type MemberRow = Awaited<ReturnType<ReturnType<typeof memberQuery>['all']>>[number];

function toMember(row: MemberRow): ProjectMember {
  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    avatarUrl: avatarUrlFor(row.avatarKey),
    role: row.role,
    isOwner: row.ownerId === row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMembers(db: D1Database, projectId: string): Promise<ProjectMember[]> {
  const rows = await memberQuery(db)
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt), asc(sql`${projectMembers}.rowid`));
  return rows.map(toMember);
}

async function getMember(
  db: D1Database,
  projectId: string,
  userId: string,
): Promise<ProjectMember> {
  const rows = await memberQuery(db).where(
    and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
  );
  const row = rows[0];
  if (!row) throw apiError(404, 'not_found');
  return toMember(row);
}

export async function isMember(
  db: D1Database,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const rows = await drizzle(db)
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  return rows.length > 0;
}

export async function updateMemberRole(
  db: D1Database,
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<ProjectMember> {
  const target = await getMember(db, projectId, userId);
  if (target.isOwner) throw apiError(400, 'owner_immutable');
  await drizzle(db)
    .update(projectMembers)
    .set({ role })
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  return { ...target, role };
}

export async function removeMember(
  db: D1Database,
  projectId: string,
  userId: string,
  actorId: string,
): Promise<void> {
  const target = await getMember(db, projectId, userId);
  if (target.isOwner) throw apiError(400, 'owner_immutable');
  if (userId === actorId) throw apiError(400, 'cannot_remove_self');
  const orm = drizzle(db);
  // Assignees must be members, so unassign the removed user's tasks in the same batch.
  await orm.batch([
    orm
      .update(tasks)
      .set({ assigneeId: null })
      .where(and(eq(tasks.projectId, projectId), eq(tasks.assigneeId, userId))),
    orm
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))),
  ]);
}
