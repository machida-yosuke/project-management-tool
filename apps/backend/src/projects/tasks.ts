import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { D1Database } from '@cloudflare/workers-types';
import type { Task, TaskStatus } from '@pm-tool/shared';
import { tasks, users } from '../db/schema';
import { apiError } from './errors';
import { isMember } from './members';

const assignee = alias(users, 'assignee');
const creator = alias(users, 'creator');

function taskQuery(db: D1Database) {
  return drizzle(db)
    .select({
      task: tasks,
      assignee: { id: assignee.id, email: assignee.email, name: assignee.name },
      createdBy: { id: creator.id, email: creator.email, name: creator.name },
    })
    .from(tasks)
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .innerJoin(creator, eq(creator.id, tasks.createdBy));
}

type TaskRow = Awaited<ReturnType<ReturnType<typeof taskQuery>['all']>>[number];

function toTask(row: TaskRow): Task {
  return {
    id: row.task.id,
    projectId: row.task.projectId,
    title: row.task.title,
    description: row.task.description,
    status: row.task.status,
    assignee: row.assignee,
    createdBy: row.createdBy,
    createdAt: row.task.createdAt.toISOString(),
    updatedAt: row.task.updatedAt.toISOString(),
  };
}

export async function listTasks(db: D1Database, projectId: string): Promise<Task[]> {
  const rows = await taskQuery(db)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.createdAt), asc(sql`${tasks}.rowid`));
  return rows.map(toTask);
}

export async function getTask(db: D1Database, projectId: string, taskId: string): Promise<Task> {
  const rows = await taskQuery(db).where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)));
  const row = rows[0];
  if (!row) throw apiError(404, 'not_found');
  return toTask(row);
}

async function assertAssignable(
  db: D1Database,
  projectId: string,
  assigneeId: string | null | undefined,
) {
  if (assigneeId && !(await isMember(db, projectId, assigneeId))) {
    throw apiError(400, 'assignee_not_member');
  }
}

export async function createTask(
  db: D1Database,
  projectId: string,
  createdBy: string,
  input: { title: string; description?: string; assigneeId?: string | null },
): Promise<Task> {
  await assertAssignable(db, projectId, input.assigneeId);
  const now = new Date();
  const id = crypto.randomUUID();
  await drizzle(db)
    .insert(tasks)
    .values({
      id,
      projectId,
      title: input.title,
      description: input.description ?? '',
      status: 'open',
      assigneeId: input.assigneeId ?? null,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });
  return getTask(db, projectId, id);
}

export async function updateTask(
  db: D1Database,
  projectId: string,
  taskId: string,
  input: { title?: string; description?: string; status?: TaskStatus; assigneeId?: string | null },
): Promise<Task> {
  await getTask(db, projectId, taskId);
  await assertAssignable(db, projectId, input.assigneeId);
  await drizzle(db)
    .update(tasks)
    .set({
      title: input.title,
      description: input.description,
      status: input.status,
      assigneeId: input.assigneeId,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)));
  return getTask(db, projectId, taskId);
}

export async function deleteTask(db: D1Database, projectId: string, taskId: string): Promise<void> {
  const deleted = await drizzle(db)
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
    .returning({ id: tasks.id });
  if (deleted.length === 0) throw apiError(404, 'not_found');
}
