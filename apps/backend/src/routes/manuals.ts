import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AuthEnv } from '../middleware/require-auth';
import { onValidationError } from '../middleware/validation';
import { EDITOR_ROLES, assertRole, requireMembership } from '../projects/authorize';
import {
  createManualPage,
  deleteManualPage,
  getManualPage,
  listManualPages,
  updateManualPage,
} from '../projects/manuals';

const title = z.string().trim().min(1).max(200);
const body = z.unknown();

const projectParam = z.object({ projectId: z.string() });
const manualParam = z.object({ projectId: z.string(), manualId: z.string() });
const listQuery = z.object({ q: z.string().optional() });
const createSchema = z.object({ title, body: body.optional() });
const updateSchema = z.object({ title: title.optional(), body: body.optional() });

export const manualsRoute = new Hono<AuthEnv>()
  .get(
    '/',
    zValidator('param', projectParam, onValidationError),
    zValidator('query', listQuery, onValidationError),
    async (c) => {
      const { projectId } = c.req.valid('param');
      await requireMembership(c.env.DB, projectId, c.get('user').id);
      return c.json(await listManualPages(c.env.DB, projectId, c.req.valid('query')));
    },
  )
  .post(
    '/',
    zValidator('param', projectParam, onValidationError),
    zValidator('json', createSchema, onValidationError),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const userId = c.get('user').id;
      const membership = await requireMembership(c.env.DB, projectId, userId);
      assertRole(membership, EDITOR_ROLES);
      return c.json(await createManualPage(c.env.DB, projectId, userId, c.req.valid('json')), 201);
    },
  )
  .get('/:manualId', zValidator('param', manualParam, onValidationError), async (c) => {
    const { projectId, manualId } = c.req.valid('param');
    await requireMembership(c.env.DB, projectId, c.get('user').id);
    return c.json(await getManualPage(c.env.DB, projectId, manualId));
  })
  .patch(
    '/:manualId',
    zValidator('param', manualParam, onValidationError),
    zValidator('json', updateSchema, onValidationError),
    async (c) => {
      const { projectId, manualId } = c.req.valid('param');
      const membership = await requireMembership(c.env.DB, projectId, c.get('user').id);
      assertRole(membership, EDITOR_ROLES);
      return c.json(await updateManualPage(c.env.DB, projectId, manualId, c.req.valid('json')));
    },
  )
  .delete('/:manualId', zValidator('param', manualParam, onValidationError), async (c) => {
    const { projectId, manualId } = c.req.valid('param');
    const membership = await requireMembership(c.env.DB, projectId, c.get('user').id);
    assertRole(membership, EDITOR_ROLES);
    await deleteManualPage(c.env.DB, projectId, manualId);
    return c.body(null, 204);
  });
