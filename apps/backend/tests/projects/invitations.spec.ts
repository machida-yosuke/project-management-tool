import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { Project, ProjectInvitation } from '@pm-tool/shared';
import { projectInvitations } from '../../src/db/schema';
import { api, createProjectAs, createUser, json, setupProject, type TestUser } from './helpers';

async function invite(
  admin: TestUser,
  projectId: string,
  email: string,
  passcode = 'secret-1',
  role = 'staff',
): Promise<ProjectInvitation> {
  const res = await api(admin, `/api/projects/${projectId}/invitations`, {
    method: 'POST',
    body: { email, role, passcode },
  });
  expect(res.status).toBe(201);
  return json<ProjectInvitation>(res);
}

function accept(user: TestUser, invitationId: string, passcode: string): Promise<Response> {
  return api(user, `/api/invitations/${invitationId}/accept`, {
    method: 'POST',
    body: { passcode },
  });
}

async function storedInvitation(id: string) {
  const rows = await drizzle(env.DB)
    .select()
    .from(projectInvitations)
    .where(eq(projectInvitations.id, id));
  return rows[0];
}

describe('invitation routes', () => {
  it('creates an invitation with a normalized email and never stores the plain passcode', async () => {
    const admin = await createUser('admin');
    const project = await createProjectAs(admin, 'Invite project');
    const invitation = await invite(admin, project.id, '  New.Person@Example.COM ', 'plain-pass');

    expect(invitation).toMatchObject({
      projectId: project.id,
      projectName: 'Invite project',
      email: 'new.person@example.com',
      role: 'staff',
      invitedBy: { id: admin.id, email: admin.email, name: admin.name },
    });
    const ttl = new Date(invitation.expiresAt).getTime() - new Date(invitation.createdAt).getTime();
    expect(ttl).toBe(7 * 24 * 60 * 60 * 1000);

    const stored = await storedInvitation(invitation.id);
    expect(stored?.passcodeHash).not.toContain('plain-pass');
    expect(stored?.passcodeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.passcodeSalt).toMatch(/^[0-9a-f]{32}$/);

    const listed = await json<ProjectInvitation[]>(
      await api(admin, `/api/projects/${project.id}/invitations`),
    );
    expect(listed.map((i) => i.id)).toEqual([invitation.id]);
  });

  it('validates the invitation body', async () => {
    const admin = await createUser('admin');
    const project = await createProjectAs(admin);
    const base = `/api/projects/${project.id}/invitations`;
    for (const body of [
      { email: 'not-an-email', role: 'staff', passcode: '1234' },
      { email: 'a@example.com', role: 'owner', passcode: '1234' },
      { email: 'a@example.com', role: 'staff', passcode: '123' },
      { email: 'a@example.com', role: 'staff', passcode: 'x'.repeat(33) },
    ]) {
      const res = await api(admin, base, { method: 'POST', body });
      expect(res.status).toBe(400);
      expect(await json<{ error: string }>(res)).toMatchObject({ error: 'validation_error' });
    }
  });

  it('rejects inviting an existing member with 409', async () => {
    const { project, admin, staff } = await setupProject();
    const res = await api(admin, `/api/projects/${project.id}/invitations`, {
      method: 'POST',
      body: { email: staff.email.toUpperCase(), role: 'admin', passcode: '1234' },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_member' });
  });

  it('restricts project invitation management to admins', async () => {
    const { project, staff, substaff, outsider } = await setupProject();
    const base = `/api/projects/${project.id}/invitations`;
    const body = { email: 'x@example.com', role: 'staff', passcode: '1234' };
    for (const actor of [staff, substaff]) {
      expect((await api(actor, base)).status).toBe(403);
      expect((await api(actor, base, { method: 'POST', body })).status).toBe(403);
      expect((await api(actor, `${base}/any`, { method: 'DELETE' })).status).toBe(403);
    }
    expect((await api(outsider, base)).status).toBe(404);
    expect((await api(outsider, base, { method: 'POST', body })).status).toBe(404);
  });

  it('lets admin delete an invitation', async () => {
    const admin = await createUser('admin');
    const project = await createProjectAs(admin);
    const invitee = await createUser('invitee');
    const invitation = await invite(admin, project.id, invitee.email);

    const res = await api(admin, `/api/projects/${project.id}/invitations/${invitation.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(204);
    expect(await json<ProjectInvitation[]>(await api(invitee, '/api/invitations'))).toEqual([]);

    const again = await api(admin, `/api/projects/${project.id}/invitations/${invitation.id}`, {
      method: 'DELETE',
    });
    expect(again.status).toBe(404);
  });

  it('shows only unexpired invitations addressed to the logged-in user', async () => {
    const admin = await createUser('admin');
    const project = await createProjectAs(admin);
    const invitee = await createUser('invitee');
    const other = await createUser('other');
    const invitation = await invite(admin, project.id, invitee.email.toUpperCase());

    expect(
      (await json<ProjectInvitation[]>(await api(invitee, '/api/invitations'))).map((i) => i.id),
    ).toEqual([invitation.id]);
    expect(await json<ProjectInvitation[]>(await api(other, '/api/invitations'))).toEqual([]);

    await drizzle(env.DB)
      .update(projectInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(projectInvitations.id, invitation.id));
    expect(await json<ProjectInvitation[]>(await api(invitee, '/api/invitations'))).toEqual([]);
  });

  it('accepts with the right passcode, creating membership and removing the invitation', async () => {
    const admin = await createUser('admin');
    const project = await createProjectAs(admin, 'Joinable');
    const invitee = await createUser('invitee');
    const invitation = await invite(admin, project.id, invitee.email, 'secret-1', 'substaff');

    const res = await accept(invitee, invitation.id, 'secret-1');
    expect(res.status).toBe(200);
    expect(await json<Project>(res)).toMatchObject({
      id: project.id,
      name: 'Joinable',
      role: 'substaff',
    });

    expect(await storedInvitation(invitation.id)).toBeUndefined();
    const projects = await json<Project[]>(await api(invitee, '/api/projects'));
    expect(projects).toEqual([expect.objectContaining({ id: project.id, role: 'substaff' })]);
  });

  it('returns 404 when a different user tries to accept', async () => {
    const admin = await createUser('admin');
    const project = await createProjectAs(admin);
    const invitee = await createUser('invitee');
    const other = await createUser('other');
    const invitation = await invite(admin, project.id, invitee.email);

    const res = await accept(other, invitation.id, 'secret-1');
    expect(res.status).toBe(404);
    expect((await api(other, `/api/projects/${project.id}`)).status).toBe(404);
  });

  it('counts wrong passcodes and locks after more than 10 failures', async () => {
    const admin = await createUser('admin');
    const project = await createProjectAs(admin);
    const invitee = await createUser('invitee');
    const invitation = await invite(admin, project.id, invitee.email);

    const wrong = await accept(invitee, invitation.id, 'wrong-pass');
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: 'invalid_passcode' });
    expect((await storedInvitation(invitation.id))?.failedAttempts).toBe(1);

    await drizzle(env.DB)
      .update(projectInvitations)
      .set({ failedAttempts: 9 })
      .where(eq(projectInvitations.id, invitation.id));
    expect((await accept(invitee, invitation.id, 'wrong-pass')).status).toBe(400);
    expect((await storedInvitation(invitation.id))?.failedAttempts).toBe(10);

    const locked = await accept(invitee, invitation.id, 'secret-1');
    expect(locked.status).toBe(423);
    expect(await locked.json()).toEqual({ error: 'locked' });
    expect((await api(invitee, `/api/projects/${project.id}`)).status).toBe(404);

    const reinvited = await invite(admin, project.id, invitee.email, 'new-secret');
    expect(reinvited.id).toBe(invitation.id);
    expect((await storedInvitation(invitation.id))?.failedAttempts).toBe(0);
    expect((await accept(invitee, invitation.id, 'secret-1')).status).toBe(400);
    expect((await accept(invitee, invitation.id, 'new-secret')).status).toBe(200);
  });

  it('returns 410 for an expired invitation', async () => {
    const admin = await createUser('admin');
    const project = await createProjectAs(admin);
    const invitee = await createUser('invitee');
    const invitation = await invite(admin, project.id, invitee.email);
    await drizzle(env.DB)
      .update(projectInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(projectInvitations.id, invitation.id));

    const res = await accept(invitee, invitation.id, 'secret-1');
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'expired' });
  });
});
