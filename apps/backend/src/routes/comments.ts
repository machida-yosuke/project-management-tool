import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AuthEnv } from '../middleware/require-auth';
import { onValidationError } from '../middleware/validation';
import { EDITOR_ROLES, assertRole, requireMembership } from '../projects/authorize';
import {
  createComment,
  listComments,
  listProjectComments,
  updateComment,
} from '../projects/comments';

const taskParam = z.object({ projectId: z.string(), taskId: z.string() });
const commentParam = z.object({ projectId: z.string(), taskId: z.string(), commentId: z.string() });
const bodySchema = z.object({ body: z.unknown() });
const projectParam = z.object({ projectId: z.string() });
// A digits-only regex rejects inputs Number() would accept, such as '1e1', ' 5' or '0x10'.
const projectCommentsQuery = z.object({
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(50))
    .default(20),
});

export const projectCommentsRoute = new Hono<AuthEnv>().get(
  '/',
  zValidator('param', projectParam, onValidationError),
  zValidator('query', projectCommentsQuery, onValidationError),
  async (c) => {
    const { projectId } = c.req.valid('param');
    await requireMembership(c.env.DB, projectId, c.get('user').id);
    return c.json(await listProjectComments(c.env.DB, projectId, c.req.valid('query').limit));
  },
);

export const commentsRoute = new Hono<AuthEnv>()
  .get('/', zValidator('param', taskParam, onValidationError), async (c) => {
    const { projectId, taskId } = c.req.valid('param');
    await requireMembership(c.env.DB, projectId, c.get('user').id);
    return c.json(await listComments(c.env.DB, projectId, taskId));
  })
  .post(
    '/',
    zValidator('param', taskParam, onValidationError),
    zValidator('json', bodySchema, onValidationError),
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
  )
  .patch(
    '/:commentId',
    zValidator('param', commentParam, onValidationError),
    zValidator('json', bodySchema, onValidationError),
    async (c) => {
      const { projectId, taskId, commentId } = c.req.valid('param');
      const userId = c.get('user').id;
      const membership = await requireMembership(c.env.DB, projectId, userId);
      assertRole(membership, EDITOR_ROLES);
      const comment = await updateComment(
        c.env.DB,
        projectId,
        taskId,
        commentId,
        userId,
        c.req.valid('json').body,
      );
      return c.json(comment);
    },
  );
