import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { PROJECT_ROLES } from '@pm-tool/shared';
import type { AuthEnv } from '../middleware/require-auth';
import { onValidationError } from '../middleware/validation';
import { MANAGER_ROLES, assertRole, requireMembership } from '../projects/authorize';
import { listMembers, removeMember, updateMemberRole } from '../projects/members';

const projectParam = z.object({ projectId: z.string() });
const memberParam = z.object({ projectId: z.string(), userId: z.string() });
const updateSchema = z.object({ role: z.enum(PROJECT_ROLES) });

export const membersRoute = new Hono<AuthEnv>()
  .get('/', zValidator('param', projectParam, onValidationError), async (c) => {
    const { projectId } = c.req.valid('param');
    await requireMembership(c.env.DB, projectId, c.get('user').id);
    return c.json(await listMembers(c.env.DB, projectId));
  })
  .patch(
    '/:userId',
    zValidator('param', memberParam, onValidationError),
    zValidator('json', updateSchema, onValidationError),
    async (c) => {
      const { projectId, userId } = c.req.valid('param');
      const membership = await requireMembership(c.env.DB, projectId, c.get('user').id);
      assertRole(membership, MANAGER_ROLES);
      return c.json(await updateMemberRole(c.env.DB, projectId, userId, c.req.valid('json').role));
    },
  )
  .delete('/:userId', zValidator('param', memberParam, onValidationError), async (c) => {
    const { projectId, userId } = c.req.valid('param');
    const actorId = c.get('user').id;
    const membership = await requireMembership(c.env.DB, projectId, actorId);
    assertRole(membership, MANAGER_ROLES);
    await removeMember(c.env.DB, projectId, userId, actorId);
    return c.body(null, 204);
  });
