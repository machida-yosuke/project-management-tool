import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import { DEFAULT_LABELS, emptyRichTextDoc, type Project, type ProjectRole } from '@pm-tool/shared';
import { projectMembers, projects, taskLabels } from '../db/schema';
import { apiError } from './errors';
import { deserializeRichText, serializeRichText } from './rich-text';

type ProjectRow = typeof projects.$inferSelect;

function toProject(row: ProjectRow, role: ProjectRole): Project {
  return {
    id: row.id,
    name: row.name,
    description: deserializeRichText(row.description, row.id),
    ownerId: row.ownerId,
    role,
    archivedAt: row.archivedAt?.toISOString() ?? null,
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
  input: { name: string; description?: unknown },
): Promise<Project> {
  const orm = drizzle(db);
  const now = new Date();
  const id = crypto.randomUUID();
  // `null` is not coalesced: the contract only allows omitting the field, not nulling it.
  const description = serializeRichText(
    input.description === undefined ? emptyRichTextDoc() : input.description,
    id,
    'description',
    { allowEmpty: true },
  );
  const row: ProjectRow = {
    id,
    name: input.name,
    description,
    ownerId,
    archivedAt: null,
    createdAt: now,
  };
  await orm.batch([
    orm.insert(projects).values(row),
    orm
      .insert(projectMembers)
      .values({ projectId: row.id, userId: ownerId, role: 'admin', createdAt: now }),
    orm.insert(taskLabels).values(
      DEFAULT_LABELS.map((label) => ({
        id: crypto.randomUUID(),
        projectId: row.id,
        name: label.name,
        color: label.color,
        createdAt: now,
      })),
    ),
  ]);
  return toProject(row, 'admin');
}

export async function updateProject(
  db: D1Database,
  projectId: string,
  role: ProjectRole,
  input: { name?: string; description?: unknown },
): Promise<Project> {
  const description =
    input.description === undefined
      ? undefined
      : serializeRichText(input.description, projectId, 'description', { allowEmpty: true });
  if (input.name !== undefined || description !== undefined) {
    await drizzle(db)
      .update(projects)
      .set({ name: input.name, description })
      .where(eq(projects.id, projectId));
  }
  return getProject(db, projectId, role);
}

// Conditional on the current state so a repeated call leaves archivedAt untouched.
export async function setProjectArchived(
  db: D1Database,
  projectId: string,
  role: ProjectRole,
  archived: boolean,
): Promise<Project> {
  await drizzle(db)
    .update(projects)
    .set({ archivedAt: archived ? new Date() : null })
    .where(
      and(
        eq(projects.id, projectId),
        archived ? isNull(projects.archivedAt) : isNotNull(projects.archivedAt),
      ),
    );
  return getProject(db, projectId, role);
}

export async function deleteProject(db: D1Database, projectId: string): Promise<void> {
  await drizzle(db).delete(projects).where(eq(projects.id, projectId));
}
