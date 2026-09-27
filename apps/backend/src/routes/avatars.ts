import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AuthEnv } from '../middleware/require-auth';
import { onValidationError } from '../middleware/validation';
import { avatarKeyFor } from '../users/avatar';

const avatarParam = z.object({ userId: z.string(), fileId: z.uuid() });

export const avatarsRoute = new Hono<AuthEnv>().get(
  '/:userId/:fileId',
  zValidator('param', avatarParam, onValidationError),
  async (c) => {
    const { userId, fileId } = c.req.valid('param');
    const object = await c.env.ATTACHMENTS.get(avatarKeyFor(userId, fileId));
    if (!object) {
      return c.json({ error: 'not_found' }, 404);
    }
    // Headers are set by hand instead of writeHttpMetadata(): the frontend type-checks this
    // module against Node's Headers, which workers-types' signature rejects.
    return new Response(object.body, {
      headers: {
        'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
        etag: object.httpEtag,
        // Every upload gets a fresh key, so a given URL's bytes never change.
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  },
);
