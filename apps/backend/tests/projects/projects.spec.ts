import { describe, expect, it } from 'vitest';
import type { Project } from '@pm-tool/shared';
import { addMember, api, createProjectAs, createUser, json, setupProject } from './helpers';

describe('projects routes', () => {
  it('creates a project with the creator as admin owner', async () => {
    const owner = await createUser('owner');
    const res = await api(owner, '/api/projects', {
      method: 'POST',
      body: { name: '  My project  ', description: 'desc' },
    });
    expect(res.status).toBe(201);
    const project = await json<Project>(res);
    expect(project).toMatchObject({
      name: 'My project',
      description: 'desc',
      ownerId: owner.id,
      role: 'admin',
    });
    expect(new Date(project.createdAt).toISOString()).toBe(project.createdAt);

    const members = await json<{ userId: string; isOwner: boolean; role: string }[]>(
      await api(owner, `/api/projects/${project.id}/members`),
    );
    expect(members).toEqual([
      expect.objectContaining({ userId: owner.id, isOwner: true, role: 'admin' }),
    ]);
  });

  it('lists only projects the user belongs to, with their own role', async () => {
    const { project, staff, outsider } = await setupProject();
    const staffList = await json<Project[]>(await api(staff, '/api/projects'));
    expect(staffList).toEqual([expect.objectContaining({ id: project.id, role: 'staff' })]);
    expect(await json<Project[]>(await api(outsider, '/api/projects'))).toEqual([]);
  });

  it('rejects invalid input with validation_error', async () => {
    const owner = await createUser('owner');
    const res = await api(owner, '/api/projects', { method: 'POST', body: { name: '   ' } });
    expect(res.status).toBe(400);
    const body = await json<{ error: string; issues: unknown[] }>(res);
    expect(body.error).toBe('validation_error');
    expect(body.issues.length).toBeGreaterThan(0);

    const tooLong = await api(owner, '/api/projects', {
      method: 'POST',
      body: { name: 'a'.repeat(201) },
    });
    expect(tooLong.status).toBe(400);
  });

  it('returns 404 to non-members for every project endpoint', async () => {
    const { project, outsider } = await setupProject();
    const base = `/api/projects/${project.id}`;
    expect((await api(outsider, base)).status).toBe(404);
    expect((await api(outsider, base, { method: 'PATCH', body: { name: 'x' } })).status).toBe(404);
    expect((await api(outsider, base, { method: 'DELETE' })).status).toBe(404);
    expect((await api(outsider, `${base}/members`)).status).toBe(404);
    expect((await api(outsider, `${base}/tasks`)).status).toBe(404);
    expect((await api(outsider, '/api/projects/does-not-exist')).status).toBe(404);
  });

  it('lets admin and staff edit but forbids substaff', async () => {
    const { project, admin, staff, substaff } = await setupProject();
    const base = `/api/projects/${project.id}`;

    const byStaff = await api(staff, base, { method: 'PATCH', body: { name: 'Renamed' } });
    expect(byStaff.status).toBe(200);
    expect(await json<Project>(byStaff)).toMatchObject({ name: 'Renamed', role: 'staff' });

    const byAdmin = await api(admin, base, { method: 'PATCH', body: { description: 'new' } });
    expect(await json<Project>(byAdmin)).toMatchObject({ name: 'Renamed', description: 'new' });

    const bySubstaff = await api(substaff, base, { method: 'PATCH', body: { name: 'Nope' } });
    expect(bySubstaff.status).toBe(403);
    expect(await bySubstaff.json()).toEqual({ error: 'forbidden' });

    const view = await api(substaff, base);
    expect(await json<Project>(view)).toMatchObject({ name: 'Renamed', role: 'substaff' });
  });

  it('allows only the owner to delete, and cascades', async () => {
    const { project, admin, staff } = await setupProject();
    const base = `/api/projects/${project.id}`;
    const task = await api(admin, `${base}/tasks`, { method: 'POST', body: { title: 'T' } });
    expect(task.status).toBe(201);

    expect((await api(staff, base, { method: 'DELETE' })).status).toBe(403);
    const coAdmin = await createUser('co-admin');
    await addMember(admin, project.id, coAdmin, 'admin');
    expect((await api(coAdmin, base, { method: 'DELETE' })).status).toBe(403);

    const other = await createProjectAs(staff, 'Other');

    expect((await api(admin, base, { method: 'DELETE' })).status).toBe(204);
    expect((await api(admin, base)).status).toBe(404);
    expect((await api(staff, base)).status).toBe(404);
    expect(await json<Project[]>(await api(staff, '/api/projects'))).toEqual([
      expect.objectContaining({ id: other.id }),
    ]);
  });
});
