import { describe, expect, it } from 'vitest';
import { DEFAULT_LABELS, type Task, type TaskLabel } from '@pm-tool/shared';
import { api, json, setupProject } from './helpers';

const INVALID_COLORS = ['red', '#fff', '#12345g', 'e5484d'];

describe('labels routes', () => {
  it('lists the default labels in creation order for any member', async () => {
    const { project, substaff } = await setupProject();
    const res = await api(substaff, `/api/projects/${project.id}/labels`);
    expect(res.status).toBe(200);
    const labels = await json<TaskLabel[]>(res);
    expect(labels.map((l) => ({ name: l.name, color: l.color }))).toEqual(DEFAULT_LABELS);
    for (const label of labels) {
      expect(label.projectId).toBe(project.id);
      expect(new Date(label.createdAt).toISOString()).toBe(label.createdAt);
    }
  });

  it('creates labels, trimming names and appending them to the list', async () => {
    const { project, staff } = await setupProject();
    const base = `/api/projects/${project.id}/labels`;

    const res = await api(staff, base, {
      method: 'POST',
      body: { name: '  要望  ', color: '#12a594' },
    });
    expect(res.status).toBe(201);
    const label = await json<TaskLabel>(res);
    expect(label).toMatchObject({ projectId: project.id, name: '要望', color: '#12a594' });

    const listed = await json<TaskLabel[]>(await api(staff, base));
    expect(listed.map((l) => l.name)).toEqual([...DEFAULT_LABELS.map((l) => l.name), '要望']);
    expect(listed.at(-1)).toEqual(label);

    const maxLength = await api(staff, base, {
      method: 'POST',
      body: { name: 'a'.repeat(50), color: '#e5484d' },
    });
    expect(maxLength.status).toBe(201);
  });

  it('normalizes hex colors to lowercase on create and update', async () => {
    const { project, staff } = await setupProject();
    const base = `/api/projects/${project.id}/labels`;

    const created = await api(staff, base, {
      method: 'POST',
      body: { name: '要望', color: '#E5484D' },
    });
    expect(created.status).toBe(201);
    const label = await json<TaskLabel>(created);
    expect(label.color).toBe('#e5484d');

    const updated = await api(staff, `${base}/${label.id}`, {
      method: 'PATCH',
      body: { color: '#3E63DD' },
    });
    expect(updated.status).toBe(200);
    expect((await json<TaskLabel>(updated)).color).toBe('#3e63dd');

    const listed = await json<TaskLabel[]>(await api(staff, base));
    expect(listed.find((l) => l.id === label.id)?.color).toBe('#3e63dd');
  });

  it('rejects duplicate names within a project with 409', async () => {
    const { project, admin } = await setupProject();
    const other = await setupProject();
    const base = `/api/projects/${project.id}/labels`;

    const duplicate = await api(admin, base, {
      method: 'POST',
      body: { name: ' バグ報告 ', color: '#3e63dd' },
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: 'label_name_taken' });

    const elsewhere = await api(other.admin, `/api/projects/${other.project.id}/labels`, {
      method: 'POST',
      body: { name: '要望', color: '#3e63dd' },
    });
    expect(elsewhere.status).toBe(201);
    expect(
      (await api(admin, base, { method: 'POST', body: { name: '要望', color: '#e5484d' } })).status,
    ).toBe(201);
  });

  it('validates label input', async () => {
    const { project, admin } = await setupProject();
    const base = `/api/projects/${project.id}/labels`;
    const [label] = await json<TaskLabel[]>(await api(admin, base));

    for (const body of [
      { name: '', color: '#e5484d' },
      { name: '   ', color: '#e5484d' },
      { name: 'a'.repeat(51), color: '#e5484d' },
      ...INVALID_COLORS.map((color) => ({ name: 'X', color })),
      { name: 'X' },
      { color: '#e5484d' },
    ]) {
      const res = await api(admin, base, { method: 'POST', body });
      expect(res.status).toBe(400);
      expect(await json<{ error: string }>(res)).toMatchObject({ error: 'validation_error' });
    }
    for (const body of [
      { name: '  ' },
      { name: 'a'.repeat(51) },
      ...INVALID_COLORS.map((color) => ({ color })),
    ]) {
      const res = await api(admin, `${base}/${label!.id}`, { method: 'PATCH', body });
      expect(res.status).toBe(400);
      expect(await json<{ error: string }>(res)).toMatchObject({ error: 'validation_error' });
    }
  });

  it('updates names and colors, rejecting names taken by another label', async () => {
    const { project, staff } = await setupProject();
    const base = `/api/projects/${project.id}/labels`;
    const [bug, request] = await json<TaskLabel[]>(await api(staff, base));
    const url = `${base}/${bug!.id}`;

    const renamed = await api(staff, url, { method: 'PATCH', body: { name: ' 不具合 ' } });
    expect(renamed.status).toBe(200);
    expect(await json<TaskLabel>(renamed)).toEqual({ ...bug, name: '不具合' });

    const recolored = await api(staff, url, { method: 'PATCH', body: { color: '#f76b15' } });
    expect(await json<TaskLabel>(recolored)).toEqual({ ...bug, name: '不具合', color: '#f76b15' });

    const sameName = await api(staff, url, {
      method: 'PATCH',
      body: { name: '不具合', color: '#e5484d' },
    });
    expect(sameName.status).toBe(200);
    expect(await json<TaskLabel>(sameName)).toMatchObject({ name: '不具合', color: '#e5484d' });

    const taken = await api(staff, url, { method: 'PATCH', body: { name: request!.name } });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: 'label_name_taken' });

    const task = await json<Task>(
      await api(staff, `/api/projects/${project.id}/tasks`, {
        method: 'POST',
        body: { title: 'T', labelId: bug!.id },
      }),
    );
    expect(task.label).toMatchObject({ id: bug!.id, name: '不具合', color: '#e5484d' });
  });

  it('deletes labels and clears them from tasks', async () => {
    const { project, admin, staff } = await setupProject();
    const base = `/api/projects/${project.id}/labels`;
    const tasksBase = `/api/projects/${project.id}/tasks`;
    const [bug, request] = await json<TaskLabel[]>(await api(admin, base));
    const labeled = await json<Task>(
      await api(admin, tasksBase, { method: 'POST', body: { title: 'A', labelId: bug!.id } }),
    );
    const untouched = await json<Task>(
      await api(admin, tasksBase, { method: 'POST', body: { title: 'B', labelId: request!.id } }),
    );

    expect((await api(staff, `${base}/${bug!.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await json<TaskLabel[]>(await api(admin, base))).map((l) => l.id)).not.toContain(
      bug!.id,
    );
    const tasks = await json<Task[]>(await api(admin, tasksBase));
    expect(tasks.find((t) => t.id === labeled.id)?.label).toBeNull();
    expect(tasks.find((t) => t.id === untouched.id)?.label).toEqual(request);

    expect((await api(staff, `${base}/${bug!.id}`, { method: 'DELETE' })).status).toBe(404);
    const reuse = await api(admin, base, {
      method: 'POST',
      body: { name: bug!.name, color: '#e5484d' },
    });
    expect(reuse.status).toBe(201);
  });

  it('forbids substaff from writing labels', async () => {
    const { project, substaff } = await setupProject();
    const base = `/api/projects/${project.id}/labels`;
    const [label] = await json<TaskLabel[]>(await api(substaff, base));

    const create = await api(substaff, base, {
      method: 'POST',
      body: { name: 'X', color: '#e5484d' },
    });
    expect(create.status).toBe(403);
    expect(await create.json()).toEqual({ error: 'forbidden' });
    expect(
      (await api(substaff, `${base}/${label!.id}`, { method: 'PATCH', body: { name: 'X' } }))
        .status,
    ).toBe(403);
    expect((await api(substaff, `${base}/${label!.id}`, { method: 'DELETE' })).status).toBe(403);
  });

  it('returns 404 to non-members and 401 without a session', async () => {
    const { project, admin, outsider } = await setupProject();
    const base = `/api/projects/${project.id}/labels`;
    const [label] = await json<TaskLabel[]>(await api(admin, base));
    const url = `${base}/${label!.id}`;

    expect((await api(outsider, base)).status).toBe(404);
    expect(
      (await api(outsider, base, { method: 'POST', body: { name: 'X', color: '#e5484d' } })).status,
    ).toBe(404);
    expect((await api(outsider, url, { method: 'PATCH', body: { name: 'X' } })).status).toBe(404);
    expect((await api(outsider, url, { method: 'DELETE' })).status).toBe(404);

    expect((await api(null, base)).status).toBe(401);
    expect(
      (await api(null, base, { method: 'POST', body: { name: 'X', color: '#e5484d' } })).status,
    ).toBe(401);
    expect((await api(null, url, { method: 'PATCH', body: { name: 'X' } })).status).toBe(401);
    expect((await api(null, url, { method: 'DELETE' })).status).toBe(401);
  });

  it('does not expose labels through another project', async () => {
    const a = await setupProject();
    const b = await setupProject();
    const [label] = await json<TaskLabel[]>(
      await api(a.admin, `/api/projects/${a.project.id}/labels`),
    );
    const url = `/api/projects/${b.project.id}/labels/${label!.id}`;

    const patch = await api(b.admin, url, { method: 'PATCH', body: { name: 'hijack' } });
    expect(patch.status).toBe(404);
    expect(await patch.json()).toEqual({ error: 'not_found' });
    expect((await api(b.admin, url, { method: 'DELETE' })).status).toBe(404);
    const [still] = await json<TaskLabel[]>(
      await api(a.admin, `/api/projects/${a.project.id}/labels`),
    );
    expect(still).toEqual(label);
  });
});
