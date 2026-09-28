import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import type { D1Database, R2Bucket, R2ObjectBody } from '@cloudflare/workers-types';
import { taskAttachments } from '../db/schema';

export const ATTACHMENT_CONTENT_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
];

export const MAX_ATTACHMENT_BYTES = 500 * 1024;

export const MAX_ATTACHMENT_DIMENSION = 2048;

export interface Attachment {
  id: string;
  url: string;
  contentType: string;
  size: number;
  width: number;
  height: number;
  createdAt: string;
}

export function attachmentKeyFor(projectId: string, fileId: string): string {
  return `attachments/${projectId}/${fileId}`;
}

export function attachmentUrlFor(projectId: string, fileId: string): string {
  return `/api/projects/${projectId}/attachments/${fileId}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function attachmentSrcPattern(projectId: string): RegExp {
  return new RegExp(`^/api/projects/${escapeRegExp(projectId)}/attachments/[0-9a-f-]{36}$`);
}

export async function createAttachment(
  db: D1Database,
  bucket: R2Bucket,
  projectId: string,
  uploadedBy: string,
  file: { bytes: ArrayBuffer; contentType: string; width: number; height: number },
): Promise<Attachment> {
  const id = crypto.randomUUID();
  const createdAt = new Date();
  await bucket.put(attachmentKeyFor(projectId, id), file.bytes, {
    httpMetadata: { contentType: file.contentType },
  });
  await drizzle(db).insert(taskAttachments).values({
    id,
    projectId,
    uploadedBy,
    contentType: file.contentType,
    size: file.bytes.byteLength,
    width: file.width,
    height: file.height,
    createdAt,
  });
  return {
    id,
    url: attachmentUrlFor(projectId, id),
    contentType: file.contentType,
    size: file.bytes.byteLength,
    width: file.width,
    height: file.height,
    createdAt: createdAt.toISOString(),
  };
}

// The row is checked first so an object is only served through the project it was uploaded to.
export async function getAttachmentObject(
  db: D1Database,
  bucket: R2Bucket,
  projectId: string,
  fileId: string,
): Promise<R2ObjectBody | null> {
  const rows = await drizzle(db)
    .select({ id: taskAttachments.id })
    .from(taskAttachments)
    .where(and(eq(taskAttachments.id, fileId), eq(taskAttachments.projectId, projectId)));
  if (rows.length === 0) return null;
  return bucket.get(attachmentKeyFor(projectId, fileId));
}
