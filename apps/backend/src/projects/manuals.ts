import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, or, sql, type SQL } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import {
  emptyRichTextDoc,
  richTextDocToPlainText,
  type RichTextDoc,
  type UserSummary,
} from '@pm-tool/shared';
import { manualPages, users } from '../db/schema';
import { avatarUrlFor } from '../users/avatar';
import { apiError } from './errors';
import { deserializeRichText, serializeRichText } from './rich-text';

export interface ManualPageSummary {
  id: string;
  projectId: string;
  title: string;
  createdBy: UserSummary;
  createdAt: string;
  updatedAt: string;
}

export interface ManualPage extends ManualPageSummary {
  body: RichTextDoc;
}

const summaryFields = {
  id: manualPages.id,
  projectId: manualPages.projectId,
  title: manualPages.title,
  createdAt: manualPages.createdAt,
  updatedAt: manualPages.updatedAt,
  createdBy: {
    id: users.id,
    email: users.email,
    name: users.name,
    avatarKey: users.avatarKey,
  },
};

function summaryQuery(db: D1Database) {
  return drizzle(db)
    .select(summaryFields)
    .from(manualPages)
    .innerJoin(users, eq(users.id, manualPages.createdBy));
}

function pageQuery(db: D1Database) {
  return drizzle(db)
    .select({ ...summaryFields, body: manualPages.body })
    .from(manualPages)
    .innerJoin(users, eq(users.id, manualPages.createdBy));
}

type SummaryRow = Awaited<ReturnType<ReturnType<typeof summaryQuery>['all']>>[number];
type PageRow = Awaited<ReturnType<ReturnType<typeof pageQuery>['all']>>[number];

function toManualPageSummary(row: SummaryRow): ManualPageSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    createdBy: {
      id: row.createdBy.id,
      email: row.createdBy.email,
      name: row.createdBy.name,
      avatarUrl: avatarUrlFor(row.createdBy.avatarKey),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toManualPage(row: PageRow): ManualPage {
  return { ...toManualPageSummary(row), body: deserializeRichText(row.body, row.projectId) };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function keywordFilter(q: string | undefined): SQL | undefined {
  const keyword = q?.trim();
  if (!keyword) return undefined;
  const pattern = `%${escapeLike(keyword)}%`;
  return or(
    sql`${manualPages.title} LIKE ${pattern} ESCAPE '\\'`,
    sql`${manualPages.bodyText} LIKE ${pattern} ESCAPE '\\'`,
  );
}

export async function listManualPages(
  db: D1Database,
  projectId: string,
  options: { q?: string },
): Promise<ManualPageSummary[]> {
  const rows = await summaryQuery(db)
    .where(and(eq(manualPages.projectId, projectId), keywordFilter(options.q)))
    .orderBy(asc(manualPages.createdAt), asc(sql`${manualPages}.rowid`));
  return rows.map(toManualPageSummary);
}

export async function getManualPage(
  db: D1Database,
  projectId: string,
  manualId: string,
): Promise<ManualPage> {
  const rows = await pageQuery(db).where(
    and(eq(manualPages.id, manualId), eq(manualPages.projectId, projectId)),
  );
  const row = rows[0];
  if (!row) throw apiError(404, 'not_found');
  return toManualPage(row);
}

function serializeBody(input: unknown, projectId: string): { body: string; bodyText: string } {
  const body = serializeRichText(input, projectId, 'body', { allowEmpty: true });
  return { body, bodyText: richTextDocToPlainText(deserializeRichText(body, projectId)) };
}

export async function createManualPage(
  db: D1Database,
  projectId: string,
  userId: string,
  input: { title: string; body?: unknown },
): Promise<ManualPage> {
  const id = crypto.randomUUID();
  const now = new Date();
  await drizzle(db)
    .insert(manualPages)
    .values({
      id,
      projectId,
      title: input.title,
      ...serializeBody(input.body === undefined ? emptyRichTextDoc() : input.body, projectId),
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  return getManualPage(db, projectId, id);
}

export async function updateManualPage(
  db: D1Database,
  projectId: string,
  manualId: string,
  input: { title?: string; body?: unknown },
): Promise<ManualPage> {
  const rows = await drizzle(db)
    .update(manualPages)
    .set({
      title: input.title,
      ...(input.body === undefined ? {} : serializeBody(input.body, projectId)),
      updatedAt: new Date(),
    })
    .where(and(eq(manualPages.id, manualId), eq(manualPages.projectId, projectId)))
    .returning({ id: manualPages.id });
  if (rows.length === 0) throw apiError(404, 'not_found');
  return getManualPage(db, projectId, manualId);
}

export async function deleteManualPage(
  db: D1Database,
  projectId: string,
  manualId: string,
): Promise<void> {
  const rows = await drizzle(db)
    .delete(manualPages)
    .where(and(eq(manualPages.id, manualId), eq(manualPages.projectId, projectId)))
    .returning({ id: manualPages.id });
  if (rows.length === 0) throw apiError(404, 'not_found');
}
