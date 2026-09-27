import { describe, expect, it } from 'vitest';
import type { ProjectMember, Task } from '@pm-tool/shared';
import { addMember, api, createUser, json, setupProject } from './helpers';

describe('members routes', () => {
  it('lists members for any member', async () => {
    const { project, admin, staff, substaff } = await setupProject();
    const res = await api(substaff, `/api/projects/${project.id}/members`);
    expect(res.status).toBe(200);
    const members = await json<ProjectMember[]>(res);
    expect(members.map((m) => [m.userId, m.role, m.isOwner])).toEqual([
      [admin.id, 'admin', true],
      [staff.id, 'staff', false],
      [substaff.id, 'substaff', false],
    ]);
    expect(members[1]).toMatchObject({ email: staff.email, name: staff.name });
  });

  it('lets admin change roles, but not for the owner', async () => {
    const { project, admin, staff } = await setupProject();
    const base = `/api/projects/${project.id}/members`;

    const res = await api(admin, `${base}/${staff.id}`, {
      method: 'PATCH',
      body: { role: 'substaff' },
    });
    expect(res.status).toBe(200);
    expect(await json<ProjectMember>(res)).toMatchObject({ userId: staff.id, role: 'substaff' });

    const owner = await api(admin, `${base}/${admin.id}`, {
      method: 'PATCH',
      body: { role: 'staff' },
    });
    expect(owner.status).toBe(400);
    expect(await owner.json()).toEqual({ error: 'owner_immutable' });

    const coAdmin = await createUser('co-admin');
    await addMember(admin, project.id, coAdmin, 'admin');
    const byCoAdmin = await api(coAdmin, `${base}/${admin.id}`, {
      method: 'PATCH',
      body: { role: 'staff' },
    });
    expect(byCoAdmin.status).toBe(400);

    const invalid = await api(admin, `${base}/${staff.id}`, {
      method: 'PATCH',
      body: { role: 'owner' },
    });
    expect(invalid.status).toBe(400);
    expect(await json<{ error: string }>(invalid)).toMatchObject({ error: 'validation_error' });

    const missing = await api(admin, `${base}/nobody`, {
      method: 'PATCH',
      body: { role: 'staff' },
    });
    expect(missing.status).toBe(404);
  });

  it('forbids staff and substaff from managing members', async () => {
    const { project, admin, staff, substaff } = await setupProject();
    const base = `/api/projects/${project.id}/members`;
    for (const actor of [staff, substaff]) {
      const patch = await api(actor, `${base}/${admin.id}`, {
        method: 'PATCH',
        body: { role: 'staff' },
      });
      expect(patch.status).toBe(403);
      expect(await patch.json()).toEqual({ error: 'forbidden' });
      expect((await api(actor, `${base}/${substaff.id}`, { method: 'DELETE' })).status).toBe(403);
    }
  });

  it('lets admin remove members, except the owner and themselves', async () => {
    const { project, admin, staff } = await setupProject();
    const base = `/api/projects/${project.id}/members`;

    const task = await json<Task>(
      await api(admin, `/api/projects/${project.id}/tasks`, {
        method: 'POST',
        body: { title: 'T', assigneeId: staff.id },
      }),
    );
    expect(task.assignee?.id).toBe(staff.id);

    expect((await api(admin, `${base}/${staff.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(staff, `/api/projects/${project.id}`)).status).toBe(404);
    const tasks = await json<Task[]>(await api(admin, `/api/projects/${project.id}/tasks`));
    expect(tasks[0]?.assignee).toBeNull();

    const owner = await api(admin, `${base}/${admin.id}`, { method: 'DELETE' });
    expect(owner.status).toBe(400);
    expect(await owner.json()).toEqual({ error: 'owner_immutable' });

    const coAdmin = await createUser('co-admin');
    await addMember(admin, project.id, coAdmin, 'admin');
    const self = await api(coAdmin, `${base}/${coAdmin.id}`, { method: 'DELETE' });
    expect(self.status).toBe(400);
    expect(await self.json()).toEqual({ error: 'cannot_remove_self' });
    expect((await api(coAdmin, `${base}/${admin.id}`, { method: 'DELETE' })).status).toBe(400);
  });
});
