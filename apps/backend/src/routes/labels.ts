import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { LABEL_COLOR_PATTERN, LABEL_NAME_MAX_LENGTH, normalizeLabelColor } from '@pm-tool/shared';
import type { AuthEnv } from '../middleware/require-auth';
import { onValidationError } from '../middleware/validation';
import { EDITOR_ROLES, assertRole, requireMembership } from '../projects/authorize';
import { createLabel, deleteLabel, listLabels, updateLabel } from '../projects/labels';

const name = z.string().trim().min(1).max(LABEL_NAME_MAX_LENGTH);
const color = z.string().regex(LABEL_COLOR_PATTERN).transform(normalizeLabelColor);

const projectParam = z.object({ projectId: z.string() });
const labelParam = z.object({ projectId: z.string(), labelId: z.string() });
const createSchema = z.object({ name, color });
const updateSchema = z.object({ name: name.optional(), color: color.optional() });

export const labelsRoute = new Hono<AuthEnv>()
  .get('/', zValidator('param', projectParam, onValidationError), async (c) => {
    const { projectId } = c.req.valid('param');
    await requireMembership(c.env.DB, projectId, c.get('user').id);
    return c.json(await listLabels(c.env.DB, projectId));
  })
  .post(
    '/',
    zValidator('param', projectParam, onValidationError),
    zValidator('json', createSchema, onValidationError),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const membership = await requireMembership(c.env.DB, projectId, c.get('user').id);
      assertRole(membership, EDITOR_ROLES);
      return c.json(await createLabel(c.env.DB, projectId, c.req.valid('json')), 201);
    },
  )
  .patch(
    '/:labelId',
    zValidator('param', labelParam, onValidationError),
    zValidator('json', updateSchema, onValidationError),
    async (c) => {
      const { projectId, labelId } = c.req.valid('param');
      const membership = await requireMembership(c.env.DB, projectId, c.get('user').id);
      assertRole(membership, EDITOR_ROLES);
      return c.json(await updateLabel(c.env.DB, projectId, labelId, c.req.valid('json')));
    },
  )
  .delete('/:labelId', zValidator('param', labelParam, onValidationError), async (c) => {
    const { projectId, labelId } = c.req.valid('param');
    const membership = await requireMembership(c.env.DB, projectId, c.get('user').id);
    assertRole(membership, EDITOR_ROLES);
    await deleteLabel(c.env.DB, projectId, labelId);
    return c.body(null, 204);
  });
