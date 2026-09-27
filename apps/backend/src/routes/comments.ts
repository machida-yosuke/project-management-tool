import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AuthEnv } from '../middleware/require-auth';
import { onValidationError } from '../middleware/validation';
import { EDITOR_ROLES, assertRole, requireMembership } from '../projects/authorize';
import { createComment, listComments } from '../projects/comments';

const taskParam = z.object({ projectId: z.string(), taskId: z.string() });
const createSchema = z.object({ body: z.string().trim().min(1).max(4000) });

export const commentsRoute = new Hono<AuthEnv>()
  .get('/', zValidator('param', taskParam, onValidationError), async (c) => {
    const { projectId, taskId } = c.req.valid('param');
    await requireMembership(c.env.DB, projectId, c.get('user').id);
    return c.json(await listComments(c.env.DB, projectId, taskId));
  })
  .post(
    '/',
    zValidator('param', taskParam, onValidationError),
    zValidator('json', createSchema, onValidationError),
    async (c) => {
      const { projectId, taskId } = c.req.valid('param');
      const userId = c.get('user').id;
      const membership = await requireMembership(c.env.DB, projectId, userId);
      assertRole(membership, EDITOR_ROLES);
      const comment = await createComment(
        c.env.DB,
        projectId,
        taskId,
        userId,
        c.req.valid('json').body,
      );
      return c.json(comment, 201);
    },
  );
