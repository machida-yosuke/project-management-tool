import { describe, expect, it } from 'vitest';
import type { Task, TaskComment } from '@pm-tool/shared';
import { api, json, setupProject } from './helpers';

async function setupTask() {
  const fixture = await setupProject();
  const task = await json<Task>(
    await api(fixture.admin, `/api/projects/${fixture.project.id}/tasks`, {
      method: 'POST',
      body: { title: 'T' },
    }),
  );
  return {
    ...fixture,
    task,
    base: `/api/projects/${fixture.project.id}/tasks/${task.id}/comments`,
  };
}

describe('comments routes', () => {
  it('posts and lists comments in creation order', async () => {
    const { admin, staff, substaff, task, base } = await setupTask();

    const first = await api(staff, base, { method: 'POST', body: { body: ' hello ' } });
    expect(first.status).toBe(201);
    const firstComment = await json<TaskComment>(first);
    expect(firstComment).toMatchObject({
      taskId: task.id,
      body: 'hello',
      author: { id: staff.id, email: staff.email, name: staff.name },
    });
    const second = await json<TaskComment>(
      await api(admin, base, { method: 'POST', body: { body: 'reply' } }),
    );

    const listed = await json<TaskComment[]>(await api(substaff, base));
    expect(listed.map((c) => c.id)).toEqual([firstComment.id, second.id]);
  });

  it('forbids substaff from posting', async () => {
    const { substaff, base } = await setupTask();
    const res = await api(substaff, base, { method: 'POST', body: { body: 'hi' } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('returns 404 to non-members and for tasks outside the project', async () => {
    const { outsider, admin, project, base } = await setupTask();
    expect((await api(outsider, base)).status).toBe(404);
    expect((await api(outsider, base, { method: 'POST', body: { body: 'hi' } })).status).toBe(404);

    const other = await setupTask();
    const crossProject = `/api/projects/${project.id}/tasks/${other.task.id}/comments`;
    expect((await api(admin, crossProject)).status).toBe(404);
    expect((await api(admin, crossProject, { method: 'POST', body: { body: 'hi' } })).status).toBe(
      404,
    );
  });

  it('validates the comment body', async () => {
    const { admin, base } = await setupTask();
    for (const body of [{ body: '   ' }, { body: 'a'.repeat(4001) }, {}]) {
      const res = await api(admin, base, { method: 'POST', body });
      expect(res.status).toBe(400);
      expect(await json<{ error: string }>(res)).toMatchObject({ error: 'validation_error' });
    }
  });
});
