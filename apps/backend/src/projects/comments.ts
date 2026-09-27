import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import type { TaskComment } from '@pm-tool/shared';
import { taskComments, tasks, users } from '../db/schema';
import { avatarUrlFor } from '../users/avatar';
import { apiError } from './errors';

function commentQuery(db: D1Database) {
  return drizzle(db)
    .select({
      comment: taskComments,
      author: {
        id: users.id,
        email: users.email,
        name: users.name,
        avatarKey: users.avatarKey,
      },
    })
    .from(taskComments)
    .innerJoin(users, eq(users.id, taskComments.userId));
}

type CommentRow = Awaited<ReturnType<ReturnType<typeof commentQuery>['all']>>[number];

function toComment(row: CommentRow): TaskComment {
  return {
    id: row.comment.id,
    taskId: row.comment.taskId,
    author: {
      id: row.author.id,
      email: row.author.email,
      name: row.author.name,
      avatarUrl: avatarUrlFor(row.author.avatarKey),
    },
    body: row.comment.body,
    createdAt: row.comment.createdAt.toISOString(),
  };
}

async function assertTaskInProject(
  db: D1Database,
  projectId: string,
  taskId: string,
): Promise<void> {
  const rows = await drizzle(db)
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)));
  if (rows.length === 0) throw apiError(404, 'not_found');
}

export async function listComments(
  db: D1Database,
  projectId: string,
  taskId: string,
): Promise<TaskComment[]> {
  await assertTaskInProject(db, projectId, taskId);
  const rows = await commentQuery(db)
    .where(eq(taskComments.taskId, taskId))
    .orderBy(asc(taskComments.createdAt), asc(sql`${taskComments}.rowid`));
  return rows.map(toComment);
}

export async function createComment(
  db: D1Database,
  projectId: string,
  taskId: string,
  userId: string,
  body: string,
): Promise<TaskComment> {
  await assertTaskInProject(db, projectId, taskId);
  const id = crypto.randomUUID();
  await drizzle(db)
    .insert(taskComments)
    .values({ id, taskId, userId, body, createdAt: new Date() });
  const rows = await commentQuery(db).where(eq(taskComments.id, id));
  const row = rows[0];
  if (!row) throw new Error('comment disappeared after insert');
  return toComment(row);
}
