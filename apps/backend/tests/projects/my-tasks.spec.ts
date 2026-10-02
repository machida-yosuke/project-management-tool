import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { MyTask, Task } from '@pm-tool/shared';
import { tasks } from '../../src/db/schema';
import { api, createProjectAs, json, setupProject, type TestUser } from './helpers';

async function createTask(
  user: TestUser,
  projectId: string,
  body: Record<string, unknown>,
): Promise<Task> {
  const res = await api(user, `/api/projects/${projectId}/tasks`, { method: 'POST', body });
  if (res.status !== 201) throw new Error(`createTask failed: ${res.status}`);
  return json<Task>(res);
}

describe('GET /api/me/tasks', () => {
  it('requires authentication', async () => {
    expect((await api(null, '/api/me/tasks')).status).toBe(401);
  });

  it('returns only open, unarchived tasks assigned to the user in active projects', async () => {
    const { project, admin, staff, outsider } = await setupProject();
    const mine = await createTask(admin, project.id, { title: 'Mine', assigneeId: staff.id });
    await createTask(admin, project.id, { title: 'Others', assigneeId: admin.id });
    await createTask(admin, project.id, { title: 'Unassigned' });
    const done = await createTask(admin, project.id, { title: 'Done', assigneeId: staff.id });
    await api(admin, `/api/projects/${project.id}/tasks/${done.id}`, {
      method: 'PATCH',
      body: { status: 'done' },
    });
    const archived = await createTask(admin, project.id, {
      title: 'Archived',
      assigneeId: staff.id,
    });
    await api(admin, `/api/projects/${project.id}/tasks/${archived.id}/archive`, {
      method: 'POST',
    });

    const archivedProject = await createProjectAs(admin, 'Archived project');
    const inArchivedProject = await createTask(admin, archivedProject.id, {
      title: 'In archived project',
      assigneeId: admin.id,
    });
    await api(admin, `/api/projects/${archivedProject.id}/archive`, { method: 'POST' });

    // Assignment of a non-member can only happen through stale data; it must not leak the task.
    const stale = await createTask(admin, project.id, { title: 'Stale' });
    await drizzle(env.DB)
      .update(tasks)
      .set({ assigneeId: outsider.id })
      .where(eq(tasks.id, stale.id));

    const staffTasks = await json<MyTask[]>(await api(staff, '/api/me/tasks'));
    expect(staffTasks).toEqual([{ ...mine, project: { id: project.id, name: project.name } }]);

    const adminTasks = await json<MyTask[]>(await api(admin, '/api/me/tasks'));
    expect(adminTasks.map((t) => t.title)).toEqual(['Others']);
    expect(adminTasks.map((t) => t.id)).not.toContain(inArchivedProject.id);

    expect(await json<MyTask[]>(await api(outsider, '/api/me/tasks'))).toEqual([]);
  });

  it('orders by end date with undated tasks last, then by creation time', async () => {
    const { project, admin, staff } = await setupProject();
    const range = (startDate: string, endDate: string) => ({ startDate, endDate });
    await createTask(admin, project.id, { title: 'Undated 1', assigneeId: staff.id });
    await createTask(admin, project.id, {
      title: 'Late',
      assigneeId: staff.id,
      ...range('2026-01-01', '2026-03-01'),
    });
    await createTask(admin, project.id, {
      title: 'Early A',
      assigneeId: staff.id,
      ...range('2026-01-01', '2026-02-01'),
    });
    await createTask(admin, project.id, { title: 'Undated 2', assigneeId: staff.id });
    await createTask(admin, project.id, {
      title: 'Early B',
      assigneeId: staff.id,
      ...range('2026-01-15', '2026-02-01'),
    });

    const result = await json<MyTask[]>(await api(staff, '/api/me/tasks'));
    expect(result.map((t) => t.title)).toEqual([
      'Early A',
      'Early B',
      'Late',
      'Undated 1',
      'Undated 2',
    ]);
  });
});
