import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AccountDeletionBlocked } from '@pm-tool/shared';
import { destroySession } from '../auth/session';
import type { AuthEnv } from '../middleware/require-auth';
import { onValidationError } from '../middleware/validation';
import { MULTIPART_OVERHEAD_BYTES } from '../middleware/upload';
import { AVATAR_CONTENT_TYPES, MAX_AVATAR_BYTES, MAX_AVATAR_DIMENSION } from '../users/avatar';
import { readImageDimensions } from '../users/image-dimensions';
import {
  deleteAccount,
  findDeletionBlockers,
  removeAvatar,
  setAvatar,
  updateName,
} from '../users/account';

const updateSchema = z.object({ name: z.string().trim().min(1).max(100) });

export const meRoute = new Hono<AuthEnv>()
  .patch('/', zValidator('json', updateSchema, onValidationError), async (c) => {
    return c.json(await updateName(c.env.DB, c.get('user').id, c.req.valid('json').name));
  })
  .put(
    '/avatar',
    bodyLimit({
      maxSize: MAX_AVATAR_BYTES + MULTIPART_OVERHEAD_BYTES,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
    async (c) => {
      const { file } = await c.req.parseBody();
      if (!(file instanceof File)) {
        return c.json({ error: 'file_required' }, 400);
      }
      if (file.size > MAX_AVATAR_BYTES) {
        return c.json({ error: 'payload_too_large' }, 413);
      }
      if (!AVATAR_CONTENT_TYPES.includes(file.type)) {
        return c.json({ error: 'unsupported_media_type' }, 400);
      }
      const bytes = await file.arrayBuffer();
      const dimensions = readImageDimensions(new Uint8Array(bytes));
      // Unreadable headers share the code: the client can only fix either by re-encoding the image.
      if (
        !dimensions ||
        dimensions.width > MAX_AVATAR_DIMENSION ||
        dimensions.height > MAX_AVATAR_DIMENSION
      ) {
        return c.json({ error: 'image_too_large' }, 400);
      }
      return c.json(
        await setAvatar(c.env.DB, c.env.ATTACHMENTS, c.get('user'), {
          bytes,
          contentType: file.type,
        }),
      );
    },
  )
  .delete('/avatar', async (c) => {
    return c.json(await removeAvatar(c.env.DB, c.env.ATTACHMENTS, c.get('user').id));
  })
  .delete('/', async (c) => {
    const userId = c.get('user').id;
    const projects = await findDeletionBlockers(c.env.DB, userId);
    if (projects.length > 0) {
      const body: AccountDeletionBlocked = { error: 'owned_projects_have_members', projects };
      return c.json(body, 409);
    }
    await deleteAccount(c.env.DB, c.env.ATTACHMENTS, userId);
    await destroySession(c.env.SESSIONS, getCookie(c, 'session_id'));
    deleteCookie(c, 'session_id', { path: '/', sameSite: 'Lax', secure: true });
    return c.body(null, 204);
  });
