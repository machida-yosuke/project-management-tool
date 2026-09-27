import { drizzle } from 'drizzle-orm/d1';
import { asc, eq, sql } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import type { Project, ProjectRole } from '@pm-tool/shared';
import { projectMembers, projects } from '../db/schema';
import { apiError } from './errors';

type ProjectRow = typeof projects.$inferSelect;

function toProject(row: ProjectRow, role: ProjectRole): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.ownerId,
    role,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listProjectsForUser(db: D1Database, userId: string): Promise<Project[]> {
  const rows = await drizzle(db)
    .select({ project: projects, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, userId))
    .orderBy(asc(projects.createdAt), asc(sql`${projects}.rowid`));
  return rows.map((r) => toProject(r.project, r.role));
}

export async function getProject(
  db: D1Database,
  projectId: string,
  role: ProjectRole,
): Promise<Project> {
  const rows = await drizzle(db).select().from(projects).where(eq(projects.id, projectId));
  const row = rows[0];
  if (!row) throw apiError(404, 'not_found');
  return toProject(row, role);
}

export async function createProject(
  db: D1Database,
  ownerId: string,
  input: { name: string; description?: string },
): Promise<Project> {
  const orm = drizzle(db);
  const now = new Date();
  const row: ProjectRow = {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description ?? '',
    ownerId,
    createdAt: now,
  };
  await orm.batch([
    orm.insert(projects).values(row),
    orm
      .insert(projectMembers)
      .values({ projectId: row.id, userId: ownerId, role: 'admin', createdAt: now }),
  ]);
  return toProject(row, 'admin');
}

export async function updateProject(
  db: D1Database,
  projectId: string,
  role: ProjectRole,
  input: { name?: string; description?: string },
): Promise<Project> {
  if (input.name !== undefined || input.description !== undefined) {
    await drizzle(db)
      .update(projects)
      .set({ name: input.name, description: input.description })
      .where(eq(projects.id, projectId));
  }
  return getProject(db, projectId, role);
}

export async function deleteProject(db: D1Database, projectId: string): Promise<void> {
  await drizzle(db).delete(projects).where(eq(projects.id, projectId));
}
