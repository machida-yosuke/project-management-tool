import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { TASK_STATUSES } from '@pm-tool/shared';
import type { AuthEnv } from '../middleware/require-auth';
import { onValidationError } from '../middleware/validation';
import { EDITOR_ROLES, assertRole, requireMembership } from '../projects/authorize';
import { createTask, deleteTask, listTasks, updateTask } from '../projects/tasks';

const title = z.string().trim().min(1).max(200);
const description = z.string().max(4000);
const assigneeId = z.string().nullable();

const projectParam = z.object({ projectId: z.string() });
const taskParam = z.object({ projectId: z.string(), taskId: z.string() });
const createSchema = z.object({
  title,
  description: description.optional(),
  assigneeId: assigneeId.optional(),
});
const updateSchema = z.object({
  title: title.optional(),
  description: description.optional(),
  status: z.enum(TASK_STATUSES).optional(),
  assigneeId: assigneeId.optional(),
});

export const tasksRoute = new Hono<AuthEnv>()
  .get('/', zValidator('param', projectParam, onValidationError), async (c) => {
    const { projectId } = c.req.valid('param');
    await requireMembership(c.env.DB, projectId, c.get('user').id);
    return c.json(await listTasks(c.env.DB, projectId));
  })
  .post(
    '/',
    zValidator('param', projectParam, onValidationError),
    zValidator('json', createSchema, onValidationError),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const userId = c.get('user').id;
      const membership = await requireMembership(c.env.DB, projectId, userId);
      assertRole(membership, EDITOR_ROLES);
      return c.json(await createTask(c.env.DB, projectId, userId, c.req.valid('json')), 201);
    },
  )
  .patch(
    '/:taskId',
    zValidator('param', taskParam, onValidationError),
    zValidator('json', updateSchema, onValidationError),
    async (c) => {
      const { projectId, taskId } = c.req.valid('param');
      const membership = await requireMembership(c.env.DB, projectId, c.get('user').id);
      assertRole(membership, EDITOR_ROLES);
      return c.json(await updateTask(c.env.DB, projectId, taskId, c.req.valid('json')));
    },
  )
  .delete('/:taskId', zValidator('param', taskParam, onValidationError), async (c) => {
    const { projectId, taskId } = c.req.valid('param');
    const membership = await requireMembership(c.env.DB, projectId, c.get('user').id);
    assertRole(membership, EDITOR_ROLES);
    await deleteTask(c.env.DB, projectId, taskId);
    return c.body(null, 204);
  });
