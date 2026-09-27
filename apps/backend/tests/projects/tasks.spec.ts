import { describe, expect, it } from 'vitest';
import type { Task } from '@pm-tool/shared';
import { api, json, setupProject } from './helpers';

describe('tasks routes', () => {
  it('creates, lists in creation order, updates, and deletes tasks', async () => {
    const { project, admin, staff, substaff } = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;

    const first = await api(staff, base, {
      method: 'POST',
      body: { title: ' First ', description: 'd' },
    });
    expect(first.status).toBe(201);
    const firstTask = await json<Task>(first);
    expect(firstTask).toMatchObject({
      projectId: project.id,
      title: 'First',
      description: 'd',
      status: 'open',
      assignee: null,
      createdBy: { id: staff.id, email: staff.email, name: staff.name },
    });

    const second = await json<Task>(
      await api(admin, base, {
        method: 'POST',
        body: { title: 'Second', assigneeId: substaff.id },
      }),
    );
    expect(second.assignee).toEqual({
      id: substaff.id,
      email: substaff.email,
      name: substaff.name,
      avatarUrl: null,
    });

    const listed = await json<Task[]>(await api(substaff, base));
    expect(listed.map((t) => t.id)).toEqual([firstTask.id, second.id]);

    const updated = await api(staff, `${base}/${firstTask.id}`, {
      method: 'PATCH',
      body: { status: 'done', assigneeId: admin.id, title: 'First!' },
    });
    expect(updated.status).toBe(200);
    expect(await json<Task>(updated)).toMatchObject({
      status: 'done',
      title: 'First!',
      description: 'd',
      assignee: { id: admin.id },
    });

    const unassigned = await json<Task>(
      await api(staff, `${base}/${firstTask.id}`, { method: 'PATCH', body: { assigneeId: null } }),
    );
    expect(unassigned.assignee).toBeNull();
    expect(unassigned.status).toBe('done');

    expect((await api(staff, `${base}/${second.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await json<Task[]>(await api(admin, base))).map((t) => t.id)).toEqual([firstTask.id]);
  });

  it('forbids substaff from writing tasks', async () => {
    const { project, admin, substaff } = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;
    const task = await json<Task>(await api(admin, base, { method: 'POST', body: { title: 'T' } }));

    const create = await api(substaff, base, { method: 'POST', body: { title: 'Nope' } });
    expect(create.status).toBe(403);
    expect(await create.json()).toEqual({ error: 'forbidden' });
    expect(
      (await api(substaff, `${base}/${task.id}`, { method: 'PATCH', body: { status: 'done' } }))
        .status,
    ).toBe(403);
    expect((await api(substaff, `${base}/${task.id}`, { method: 'DELETE' })).status).toBe(403);
  });

  it('returns 404 to non-members', async () => {
    const { project, admin, outsider } = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;
    const task = await json<Task>(await api(admin, base, { method: 'POST', body: { title: 'T' } }));
    expect((await api(outsider, base)).status).toBe(404);
    expect((await api(outsider, base, { method: 'POST', body: { title: 'x' } })).status).toBe(404);
    expect(
      (await api(outsider, `${base}/${task.id}`, { method: 'PATCH', body: { title: 'x' } })).status,
    ).toBe(404);
    expect((await api(outsider, `${base}/${task.id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('rejects assignees who are not project members', async () => {
    const { project, admin, outsider } = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;

    const create = await api(admin, base, {
      method: 'POST',
      body: { title: 'T', assigneeId: outsider.id },
    });
    expect(create.status).toBe(400);
    expect(await create.json()).toEqual({ error: 'assignee_not_member' });

    const task = await json<Task>(await api(admin, base, { method: 'POST', body: { title: 'T' } }));
    const patch = await api(admin, `${base}/${task.id}`, {
      method: 'PATCH',
      body: { assigneeId: outsider.id },
    });
    expect(patch.status).toBe(400);
    expect(await patch.json()).toEqual({ error: 'assignee_not_member' });
  });

  it('does not expose tasks through another project', async () => {
    const a = await setupProject();
    const b = await setupProject();
    const task = await json<Task>(
      await api(a.admin, `/api/projects/${a.project.id}/tasks`, {
        method: 'POST',
        body: { title: 'T' },
      }),
    );
    const res = await api(b.admin, `/api/projects/${b.project.id}/tasks/${task.id}`, {
      method: 'PATCH',
      body: { title: 'hijack' },
    });
    expect(res.status).toBe(404);
    expect(
      (await api(b.admin, `/api/projects/${b.project.id}/tasks/${task.id}`, { method: 'DELETE' }))
        .status,
    ).toBe(404);
  });

  it('validates task input', async () => {
    const { project, admin } = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;
    for (const body of [
      { title: '' },
      { title: 'a'.repeat(201) },
      { title: 'T', description: 'a'.repeat(4001) },
    ]) {
      const res = await api(admin, base, { method: 'POST', body });
      expect(res.status).toBe(400);
      expect(await json<{ error: string }>(res)).toMatchObject({ error: 'validation_error' });
    }
    const task = await json<Task>(await api(admin, base, { method: 'POST', body: { title: 'T' } }));
    const bad = await api(admin, `${base}/${task.id}`, {
      method: 'PATCH',
      body: { status: 'closed' },
    });
    expect(bad.status).toBe(400);
  });
});
