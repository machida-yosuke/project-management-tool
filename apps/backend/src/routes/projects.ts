import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AuthEnv } from '../middleware/require-auth';
import { onValidationError } from '../middleware/validation';
import { EDITOR_ROLES, assertOwner, assertRole, requireMembership } from '../projects/authorize';
import {
  createProject,
  deleteProject,
  getProject,
  listProjectsForUser,
  updateProject,
} from '../projects/projects';

const name = z.string().trim().min(1).max(200);
const description = z.string().max(4000);

const createSchema = z.object({ name, description: description.optional() });
const updateSchema = z.object({ name: name.optional(), description: description.optional() });
const paramSchema = z.object({ projectId: z.string() });

export const projectsRoute = new Hono<AuthEnv>()
  .get('/', async (c) => {
    return c.json(await listProjectsForUser(c.env.DB, c.get('user').id));
  })
  .post('/', zValidator('json', createSchema, onValidationError), async (c) => {
    const project = await createProject(c.env.DB, c.get('user').id, c.req.valid('json'));
    return c.json(project, 201);
  })
  .get('/:projectId', zValidator('param', paramSchema, onValidationError), async (c) => {
    const { projectId } = c.req.valid('param');
    const membership = await requireMembership(c.env.DB, projectId, c.get('user').id);
    return c.json(await getProject(c.env.DB, projectId, membership.role));
  })
  .patch(
    '/:projectId',
    zValidator('param', paramSchema, onValidationError),
    zValidator('json', updateSchema, onValidationError),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const membership = await requireMembership(c.env.DB, projectId, c.get('user').id);
      assertRole(membership, EDITOR_ROLES);
      return c.json(await updateProject(c.env.DB, projectId, membership.role, c.req.valid('json')));
    },
  )
  .delete('/:projectId', zValidator('param', paramSchema, onValidationError), async (c) => {
    const { projectId } = c.req.valid('param');
    const membership = await requireMembership(c.env.DB, projectId, c.get('user').id);
    assertOwner(membership);
    await deleteProject(c.env.DB, projectId);
    return c.body(null, 204);
  });
