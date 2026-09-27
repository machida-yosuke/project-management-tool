import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import type { Project, ProjectInvitation, ProjectRole } from '@pm-tool/shared';
import { projectInvitations, projectMembers, projects, users } from '../db/schema';
import { apiError } from './errors';
import { hashPasscode, verifyPasscode } from './passcode';
import { getProject } from './projects';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_FAILED_ATTEMPTS = 10;

function invitationQuery(db: D1Database) {
  return drizzle(db)
    .select({
      id: projectInvitations.id,
      projectId: projectInvitations.projectId,
      projectName: projects.name,
      email: projectInvitations.email,
      role: projectInvitations.role,
      inviterId: users.id,
      inviterEmail: users.email,
      inviterName: users.name,
      expiresAt: projectInvitations.expiresAt,
      createdAt: projectInvitations.createdAt,
    })
    .from(projectInvitations)
    .innerJoin(projects, eq(projects.id, projectInvitations.projectId))
    .innerJoin(users, eq(users.id, projectInvitations.invitedBy));
}

type InvitationRow = Awaited<ReturnType<ReturnType<typeof invitationQuery>['all']>>[number];

function toInvitation(row: InvitationRow): ProjectInvitation {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    email: row.email,
    role: row.role,
    invitedBy: { id: row.inviterId, email: row.inviterEmail, name: row.inviterName },
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

const invitationOrder = [asc(projectInvitations.createdAt), asc(sql`${projectInvitations}.rowid`)];

export async function listProjectInvitations(
  db: D1Database,
  projectId: string,
): Promise<ProjectInvitation[]> {
  const rows = await invitationQuery(db)
    .where(eq(projectInvitations.projectId, projectId))
    .orderBy(...invitationOrder);
  return rows.map(toInvitation);
}

export async function listInvitationsForEmail(
  db: D1Database,
  email: string,
): Promise<ProjectInvitation[]> {
  const rows = await invitationQuery(db)
    .where(
      and(
        eq(projectInvitations.email, email.toLowerCase()),
        gt(projectInvitations.expiresAt, new Date()),
      ),
    )
    .orderBy(...invitationOrder);
  return rows.map(toInvitation);
}

export async function createInvitation(
  db: D1Database,
  projectId: string,
  invitedBy: string,
  input: { email: string; role: ProjectRole; passcode: string },
): Promise<ProjectInvitation> {
  const orm = drizzle(db);
  const email = input.email.toLowerCase();

  const existingMember = await orm
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(and(eq(projectMembers.projectId, projectId), sql`lower(${users.email}) = ${email}`));
  if (existingMember.length > 0) throw apiError(409, 'already_member');

  const { hash, salt } = await hashPasscode(input.passcode);
  const now = new Date();
  const values = {
    role: input.role,
    passcodeHash: hash,
    passcodeSalt: salt,
    failedAttempts: 0,
    invitedBy,
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    createdAt: now,
  };
  // Re-inviting overwrites the pending invitation, which also resets a lockout.
  const inserted = await orm
    .insert(projectInvitations)
    .values({ id: crypto.randomUUID(), projectId, email, ...values })
    .onConflictDoUpdate({
      target: [projectInvitations.projectId, projectInvitations.email],
      set: values,
    })
    .returning({ id: projectInvitations.id });
  const id = inserted[0]?.id;
  if (!id) throw new Error('invitation upsert returned no row');

  const rows = await invitationQuery(db).where(eq(projectInvitations.id, id));
  const row = rows[0];
  if (!row) throw new Error('invitation disappeared after upsert');
  return toInvitation(row);
}

export async function deleteInvitation(
  db: D1Database,
  projectId: string,
  invitationId: string,
): Promise<void> {
  const deleted = await drizzle(db)
    .delete(projectInvitations)
    .where(
      and(eq(projectInvitations.id, invitationId), eq(projectInvitations.projectId, projectId)),
    )
    .returning({ id: projectInvitations.id });
  if (deleted.length === 0) throw apiError(404, 'not_found');
}

export async function acceptInvitation(
  db: D1Database,
  invitationId: string,
  user: { id: string; email: string },
  passcode: string,
): Promise<Project> {
  const orm = drizzle(db);
  const rows = await orm
    .select()
    .from(projectInvitations)
    .where(
      and(
        eq(projectInvitations.id, invitationId),
        eq(projectInvitations.email, user.email.toLowerCase()),
      ),
    );
  const invitation = rows[0];
  if (!invitation) throw apiError(404, 'not_found');
  if (invitation.expiresAt.getTime() <= Date.now()) throw apiError(410, 'expired');
  if (invitation.failedAttempts >= MAX_FAILED_ATTEMPTS) throw apiError(423, 'locked');

  const ok = await verifyPasscode(passcode, invitation.passcodeHash, invitation.passcodeSalt);
  if (!ok) {
    await orm
      .update(projectInvitations)
      .set({ failedAttempts: sql`${projectInvitations.failedAttempts} + 1` })
      .where(eq(projectInvitations.id, invitation.id));
    throw apiError(400, 'invalid_passcode');
  }

  await orm.batch([
    orm
      .insert(projectMembers)
      .values({
        projectId: invitation.projectId,
        userId: user.id,
        role: invitation.role,
        createdAt: new Date(),
      })
      .onConflictDoNothing(),
    orm.delete(projectInvitations).where(eq(projectInvitations.id, invitation.id)),
  ]);

  const memberRows = await orm
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(eq(projectMembers.projectId, invitation.projectId), eq(projectMembers.userId, user.id)),
    );
  const role = memberRows[0]?.role;
  if (!role) throw new Error('membership missing after accepting invitation');
  return getProject(db, invitation.projectId, role);
}
