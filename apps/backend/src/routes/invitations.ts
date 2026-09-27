import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { PROJECT_ROLES } from '@pm-tool/shared';
import type { AuthEnv } from '../middleware/require-auth';
import { onValidationError } from '../middleware/validation';
import { MANAGER_ROLES, assertRole, requireMembership } from '../projects/authorize';
import {
  acceptInvitation,
  createInvitation,
  deleteInvitation,
  listInvitationsForEmail,
  listProjectInvitations,
} from '../projects/invitations';

const passcode = z.string().min(4).max(32);

const projectParam = z.object({ projectId: z.string() });
const projectInvitationParam = z.object({ projectId: z.string(), invitationId: z.string() });
const invitationParam = z.object({ invitationId: z.string() });
const createSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(PROJECT_ROLES),
  passcode,
});
const acceptSchema = z.object({ passcode });

export const projectInvitationsRoute = new Hono<AuthEnv>()
  .get('/', zValidator('param', projectParam, onValidationError), async (c) => {
    const { projectId } = c.req.valid('param');
    const membership = await requireMembership(c.env.DB, projectId, c.get('user').id);
    assertRole(membership, MANAGER_ROLES);
    return c.json(await listProjectInvitations(c.env.DB, projectId));
  })
  .post(
    '/',
    zValidator('param', projectParam, onValidationError),
    zValidator('json', createSchema, onValidationError),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const userId = c.get('user').id;
      const membership = await requireMembership(c.env.DB, projectId, userId);
      assertRole(membership, MANAGER_ROLES);
      const invitation = await createInvitation(c.env.DB, projectId, userId, c.req.valid('json'));
      return c.json(invitation, 201);
    },
  )
  .delete(
    '/:invitationId',
    zValidator('param', projectInvitationParam, onValidationError),
    async (c) => {
      const { projectId, invitationId } = c.req.valid('param');
      const membership = await requireMembership(c.env.DB, projectId, c.get('user').id);
      assertRole(membership, MANAGER_ROLES);
      await deleteInvitation(c.env.DB, projectId, invitationId);
      return c.body(null, 204);
    },
  );

export const invitationsRoute = new Hono<AuthEnv>()
  .get('/', async (c) => {
    return c.json(await listInvitationsForEmail(c.env.DB, c.get('user').email));
  })
  .post(
    '/:invitationId/accept',
    zValidator('param', invitationParam, onValidationError),
    zValidator('json', acceptSchema, onValidationError),
    async (c) => {
      const { invitationId } = c.req.valid('param');
      const project = await acceptInvitation(
        c.env.DB,
        invitationId,
        c.get('user'),
        c.req.valid('json').passcode,
      );
      return c.json(project);
    },
  );
