import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AuthEnv } from '../middleware/require-auth';
import { MULTIPART_OVERHEAD_BYTES } from '../middleware/upload';
import { onValidationError } from '../middleware/validation';
import {
  ATTACHMENT_CONTENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_DIMENSION,
  createAttachment,
  getAttachmentObject,
} from '../projects/attachments';
import { EDITOR_ROLES, assertRole, requireMembership } from '../projects/authorize';
import { readImageDimensions } from '../users/image-dimensions';

const projectParam = z.object({ projectId: z.string() });
const fileParam = z.object({ projectId: z.string(), fileId: z.uuid() });

export const attachmentsRoute = new Hono<AuthEnv>()
  .post(
    '/',
    zValidator('param', projectParam, onValidationError),
    bodyLimit({
      maxSize: MAX_ATTACHMENT_BYTES + MULTIPART_OVERHEAD_BYTES,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const userId = c.get('user').id;
      const membership = await requireMembership(c.env.DB, projectId, userId);
      assertRole(membership, EDITOR_ROLES);
      const { file } = await c.req.parseBody();
      if (!(file instanceof File)) {
        return c.json({ error: 'file_required' }, 400);
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return c.json({ error: 'payload_too_large' }, 413);
      }
      if (!ATTACHMENT_CONTENT_TYPES.includes(file.type)) {
        return c.json({ error: 'unsupported_media_type' }, 400);
      }
      const bytes = await file.arrayBuffer();
      const dimensions = readImageDimensions(new Uint8Array(bytes));
      if (
        !dimensions ||
        dimensions.width > MAX_ATTACHMENT_DIMENSION ||
        dimensions.height > MAX_ATTACHMENT_DIMENSION
      ) {
        return c.json({ error: 'image_too_large' }, 400);
      }
      const attachment = await createAttachment(c.env.DB, c.env.ATTACHMENTS, projectId, userId, {
        bytes,
        contentType: file.type,
        ...dimensions,
      });
      return c.json(attachment, 201);
    },
  )
  .get('/:fileId', zValidator('param', fileParam, onValidationError), async (c) => {
    const { projectId, fileId } = c.req.valid('param');
    await requireMembership(c.env.DB, projectId, c.get('user').id);
    const object = await getAttachmentObject(c.env.DB, c.env.ATTACHMENTS, projectId, fileId);
    if (!object) {
      return c.json({ error: 'not_found' }, 404);
    }
    // Same hand-built headers as avatars.ts, for the same Headers typing reason.
    return new Response(object.body, {
      headers: {
        'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
        etag: object.httpEtag,
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  });
