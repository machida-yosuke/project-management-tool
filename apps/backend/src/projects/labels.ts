import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import type { LabelColor, TaskLabel } from '@pm-tool/shared';
import { taskLabels } from '../db/schema';
import { apiError } from './errors';

type LabelRow = typeof taskLabels.$inferSelect;

export function toLabel(row: LabelRow): TaskLabel {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    color: row.color,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listLabels(db: D1Database, projectId: string): Promise<TaskLabel[]> {
  const rows = await drizzle(db)
    .select()
    .from(taskLabels)
    .where(eq(taskLabels.projectId, projectId))
    .orderBy(asc(taskLabels.createdAt), asc(sql`${taskLabels}.rowid`));
  return rows.map(toLabel);
}

export async function findLabel(
  db: D1Database,
  projectId: string,
  labelId: string,
): Promise<TaskLabel | null> {
  const rows = await drizzle(db)
    .select()
    .from(taskLabels)
    .where(and(eq(taskLabels.id, labelId), eq(taskLabels.projectId, projectId)));
  const row = rows[0];
  return row ? toLabel(row) : null;
}

async function getLabel(db: D1Database, projectId: string, labelId: string): Promise<TaskLabel> {
  const label = await findLabel(db, projectId, labelId);
  if (!label) throw apiError(404, 'not_found');
  return label;
}

export async function createLabel(
  db: D1Database,
  projectId: string,
  input: { name: string; color: LabelColor },
): Promise<TaskLabel> {
  const rows = await drizzle(db)
    .insert(taskLabels)
    .values({
      id: crypto.randomUUID(),
      projectId,
      name: input.name,
      color: input.color,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: [taskLabels.projectId, taskLabels.name] })
    .returning();
  const row = rows[0];
  if (!row) throw apiError(409, 'label_name_taken');
  return toLabel(row);
}

export async function updateLabel(
  db: D1Database,
  projectId: string,
  labelId: string,
  input: { name?: string; color?: LabelColor },
): Promise<TaskLabel> {
  const current = await getLabel(db, projectId, labelId);
  const orm = drizzle(db);
  if (input.name !== undefined && input.name !== current.name) {
    const taken = await orm
      .select({ id: taskLabels.id })
      .from(taskLabels)
      .where(
        and(
          eq(taskLabels.projectId, projectId),
          eq(taskLabels.name, input.name),
          ne(taskLabels.id, labelId),
        ),
      );
    if (taken.length > 0) throw apiError(409, 'label_name_taken');
  }
  if (input.name === undefined && input.color === undefined) return current;
  await orm
    .update(taskLabels)
    .set({ name: input.name, color: input.color })
    .where(and(eq(taskLabels.id, labelId), eq(taskLabels.projectId, projectId)));
  return getLabel(db, projectId, labelId);
}

// Tasks referencing the label are cleared by the `ON DELETE SET NULL` foreign key.
export async function deleteLabel(
  db: D1Database,
  projectId: string,
  labelId: string,
): Promise<void> {
  await getLabel(db, projectId, labelId);
  await drizzle(db)
    .delete(taskLabels)
    .where(and(eq(taskLabels.id, labelId), eq(taskLabels.projectId, projectId)));
}
