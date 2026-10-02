import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias, type SelectedFields } from 'drizzle-orm/sqlite-core';
import type { D1Database } from '@cloudflare/workers-types';
import {
  emptyRichTextDoc,
  type MyTask,
  type Task,
  type TaskStatus,
  type UserSummary,
} from '@pm-tool/shared';
import { projectMembers, projects, taskLabels, tasks, users } from '../db/schema';
import { avatarUrlFor } from '../users/avatar';
import { apiError } from './errors';
import { findLabel, toLabel } from './labels';
import { isMember } from './members';
import { deserializeRichText, serializeRichText } from './rich-text';

const assignee = alias(users, 'assignee');
const creator = alias(users, 'creator');

const taskFields = {
  task: tasks,
  assignee: {
    id: assignee.id,
    email: assignee.email,
    name: assignee.name,
    avatarKey: assignee.avatarKey,
  },
  createdBy: {
    id: creator.id,
    email: creator.email,
    name: creator.name,
    avatarKey: creator.avatarKey,
  },
  label: taskLabels,
};

function taskQuery<Extra extends SelectedFields = Record<never, never>>(
  db: D1Database,
  extra?: Extra,
) {
  return drizzle(db)
    .select({ ...taskFields, ...(extra as Extra) })
    .from(tasks)
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .leftJoin(taskLabels, eq(taskLabels.id, tasks.labelId))
    .innerJoin(creator, eq(creator.id, tasks.createdBy));
}

type TaskRow = Awaited<
  ReturnType<ReturnType<typeof taskQuery<Record<never, never>>>['all']>
>[number];

function toUserSummary(user: TaskRow['createdBy']): UserSummary {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: avatarUrlFor(user.avatarKey),
  };
}

function toTask(row: TaskRow): Task {
  return {
    id: row.task.id,
    projectId: row.task.projectId,
    title: row.task.title,
    description: deserializeRichText(row.task.description, row.task.projectId),
    descriptionEditedAt: row.task.descriptionEditedAt?.toISOString() ?? null,
    status: row.task.status,
    assignee: row.assignee && toUserSummary(row.assignee),
    startDate: row.task.startDate,
    endDate: row.task.endDate,
    label: row.label && toLabel(row.label),
    archivedAt: row.task.archivedAt?.toISOString() ?? null,
    createdBy: toUserSummary(row.createdBy),
    createdAt: row.task.createdAt.toISOString(),
    updatedAt: row.task.updatedAt.toISOString(),
  };
}

export async function listTasks(
  db: D1Database,
  projectId: string,
  options: { includeArchived: boolean },
): Promise<Task[]> {
  const rows = await taskQuery(db)
    .where(
      and(
        eq(tasks.projectId, projectId),
        options.includeArchived ? undefined : isNull(tasks.archivedAt),
      ),
    )
    .orderBy(asc(tasks.createdAt), asc(sql`${tasks}.rowid`));
  return rows.map(toTask);
}

export async function listMyTasks(db: D1Database, userId: string): Promise<MyTask[]> {
  const rows = await taskQuery(db, { project: { id: projects.id, name: projects.name } })
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, tasks.projectId), eq(projectMembers.userId, userId)),
    )
    .where(
      and(
        eq(tasks.assigneeId, userId),
        eq(tasks.status, 'open'),
        isNull(tasks.archivedAt),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(
      sql`${tasks.endDate} IS NULL`,
      asc(tasks.endDate),
      asc(tasks.createdAt),
      asc(sql`${tasks}.rowid`),
    );
  return rows.map((row) => ({ ...toTask(row), project: row.project }));
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

async function assertLabelInProject(
  db: D1Database,
  projectId: string,
  labelId: string | null | undefined,
) {
  if (labelId && !(await findLabel(db, projectId, labelId))) {
    throw apiError(400, 'validation_error');
  }
}

interface DateRange {
  startDate: string | null;
  endDate: string | null;
}

// `undefined` keeps the stored value so a PATCH of one side is checked against the other.
function resolveDateRange(
  current: DateRange,
  input: { startDate?: string | null; endDate?: string | null },
): DateRange {
  const startDate = input.startDate === undefined ? current.startDate : input.startDate;
  const endDate = input.endDate === undefined ? current.endDate : input.endDate;
  if ((startDate === null) !== (endDate === null)) throw apiError(400, 'invalid_date_range');
  if (startDate !== null && endDate !== null && startDate > endDate) {
    throw apiError(400, 'invalid_date_range');
  }
  return { startDate, endDate };
}

interface TaskInput {
  title?: string;
  description?: unknown;
  assigneeId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  labelId?: string | null;
}

export async function createTask(
  db: D1Database,
  projectId: string,
  createdBy: string,
  input: TaskInput & { title: string },
): Promise<Task> {
  const range = resolveDateRange({ startDate: null, endDate: null }, input);
  // `null` is not coalesced: the contract only allows omitting the field, not nulling it.
  const description = serializeRichText(
    input.description === undefined ? emptyRichTextDoc() : input.description,
    projectId,
    'description',
    { allowEmpty: true },
  );
  await assertAssignable(db, projectId, input.assigneeId);
  await assertLabelInProject(db, projectId, input.labelId);
  const now = new Date();
  const id = crypto.randomUUID();
  await drizzle(db)
    .insert(tasks)
    .values({
      id,
      projectId,
      title: input.title,
      description,
      descriptionEditedAt: null,
      status: 'open',
      assigneeId: input.assigneeId ?? null,
      startDate: range.startDate,
      endDate: range.endDate,
      labelId: input.labelId ?? null,
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
  input: TaskInput & { status?: TaskStatus },
): Promise<Task> {
  const current = await getTask(db, projectId, taskId);
  const range = resolveDateRange(current, input);
  const description =
    input.description === undefined
      ? undefined
      : serializeRichText(input.description, projectId, 'description', { allowEmpty: true });
  await assertAssignable(db, projectId, input.assigneeId);
  await assertLabelInProject(db, projectId, input.labelId);
  const now = new Date();
  // Compared against the normalized current doc so re-saving unchanged or legacy plain text
  // does not mark the description as edited.
  const descriptionChanged =
    description !== undefined && description !== JSON.stringify(current.description);
  await drizzle(db)
    .update(tasks)
    .set({
      title: input.title,
      description,
      descriptionEditedAt: descriptionChanged ? now : undefined,
      status: input.status,
      assigneeId: input.assigneeId,
      startDate: range.startDate,
      endDate: range.endDate,
      labelId: input.labelId,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)));
  return getTask(db, projectId, taskId);
}

// Conditional on the current state so a repeated call leaves archivedAt and updatedAt untouched.
export async function setTaskArchived(
  db: D1Database,
  projectId: string,
  taskId: string,
  archived: boolean,
): Promise<Task> {
  await getTask(db, projectId, taskId);
  const now = new Date();
  await drizzle(db)
    .update(tasks)
    .set({ archivedAt: archived ? now : null, updatedAt: now })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.projectId, projectId),
        archived ? isNull(tasks.archivedAt) : isNotNull(tasks.archivedAt),
      ),
    );
  return getTask(db, projectId, taskId);
}
