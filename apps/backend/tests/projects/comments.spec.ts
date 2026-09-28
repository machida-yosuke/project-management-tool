import { describe, expect, it } from 'vitest';
import { emptyRichTextDoc, type Task, type TaskComment } from '@pm-tool/shared';
import { api, json, richText, setupProject } from './helpers';

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

    const first = await api(staff, base, { method: 'POST', body: { body: richText('hello') } });
    expect(first.status).toBe(201);
    const firstComment = await json<TaskComment>(first);
    expect(firstComment).toMatchObject({
      taskId: task.id,
      body: richText('hello'),
      editedAt: null,
      author: { id: staff.id, email: staff.email, name: staff.name },
    });
    const second = await json<TaskComment>(
      await api(admin, base, { method: 'POST', body: { body: richText('reply') } }),
    );

    const listed = await json<TaskComment[]>(await api(substaff, base));
    expect(listed.map((c) => c.id)).toEqual([firstComment.id, second.id]);
    expect(listed[0]?.body).toEqual(richText('hello'));
  });

  it('forbids substaff from posting', async () => {
    const { substaff, base } = await setupTask();
    const res = await api(substaff, base, { method: 'POST', body: { body: richText('hi') } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('returns 404 to non-members and for tasks outside the project', async () => {
    const { outsider, admin, project, base } = await setupTask();
    const body = { body: richText('hi') };
    expect((await api(outsider, base)).status).toBe(404);
    expect((await api(outsider, base, { method: 'POST', body })).status).toBe(404);

    const other = await setupTask();
    const crossProject = `/api/projects/${project.id}/tasks/${other.task.id}/comments`;
    expect((await api(admin, crossProject)).status).toBe(404);
    expect((await api(admin, crossProject, { method: 'POST', body })).status).toBe(404);
  });

  it('validates the comment body', async () => {
    const { admin, base } = await setupTask();
    for (const body of [
      { body: emptyRichTextDoc() },
      { body: richText('   ') },
      { body: 'hello' },
      { body: { type: 'doc', content: [{ type: 'table' }] } },
      {},
    ]) {
      const res = await api(admin, base, { method: 'POST', body });
      expect(res.status).toBe(400);
      expect(await json<{ error: string }>(res)).toMatchObject({ error: 'validation_error' });
    }
  });
});

describe('PATCH comment', () => {
  it('lets the author edit the body and records editedAt', async () => {
    const { staff, base } = await setupTask();
    const comment = await json<TaskComment>(
      await api(staff, base, { method: 'POST', body: { body: richText('before') } }),
    );

    const res = await api(staff, `${base}/${comment.id}`, {
      method: 'PATCH',
      body: { body: richText('after') },
    });
    expect(res.status).toBe(200);
    const edited = await json<TaskComment>(res);
    expect(edited).toMatchObject({
      id: comment.id,
      body: richText('after'),
      createdAt: comment.createdAt,
    });
    expect(edited.editedAt).toEqual(new Date(edited.editedAt!).toISOString());

    const [listed] = await json<TaskComment[]>(await api(staff, base));
    expect(listed).toEqual(edited);
  });

  it('forbids editing someone else’s comment, even as admin', async () => {
    const { admin, staff, base } = await setupTask();
    const comment = await json<TaskComment>(
      await api(staff, base, { method: 'POST', body: { body: richText('mine') } }),
    );
    const res = await api(admin, `${base}/${comment.id}`, {
      method: 'PATCH',
      body: { body: richText('hijack') },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    const [listed] = await json<TaskComment[]>(await api(admin, base));
    expect(listed).toMatchObject({ body: richText('mine'), editedAt: null });
  });

  it('forbids substaff and hides the comment from non-members', async () => {
    const { admin, substaff, outsider, base } = await setupTask();
    const comment = await json<TaskComment>(
      await api(admin, base, { method: 'POST', body: { body: richText('hi') } }),
    );
    const body = { body: richText('x') };
    const bySubstaff = await api(substaff, `${base}/${comment.id}`, { method: 'PATCH', body });
    expect(bySubstaff.status).toBe(403);
    expect(await bySubstaff.json()).toEqual({ error: 'forbidden' });
    expect((await api(outsider, `${base}/${comment.id}`, { method: 'PATCH', body })).status).toBe(
      404,
    );
  });

  it('returns 404 for comments outside the task or project', async () => {
    const { admin, project, base } = await setupTask();
    const comment = await json<TaskComment>(
      await api(admin, base, { method: 'POST', body: { body: richText('hi') } }),
    );
    const otherTask = await json<Task>(
      await api(admin, `/api/projects/${project.id}/tasks`, {
        method: 'POST',
        body: { title: 'Other' },
      }),
    );
    const body = { body: richText('x') };
    const wrongTask = `/api/projects/${project.id}/tasks/${otherTask.id}/comments/${comment.id}`;
    expect((await api(admin, wrongTask, { method: 'PATCH', body })).status).toBe(404);
    expect(
      (await api(admin, `${base}/${crypto.randomUUID()}`, { method: 'PATCH', body })).status,
    ).toBe(404);

    const other = await setupTask();
    const foreign = await json<TaskComment>(
      await api(other.admin, other.base, { method: 'POST', body: { body: richText('hi') } }),
    );
    const crossProject = `/api/projects/${project.id}/tasks/${other.task.id}/comments/${foreign.id}`;
    expect((await api(admin, crossProject, { method: 'PATCH', body })).status).toBe(404);
  });

  it('validates the edited body', async () => {
    const { admin, base } = await setupTask();
    const comment = await json<TaskComment>(
      await api(admin, base, { method: 'POST', body: { body: richText('hi') } }),
    );
    for (const body of [{ body: emptyRichTextDoc() }, { body: 'text' }, {}]) {
      const res = await api(admin, `${base}/${comment.id}`, { method: 'PATCH', body });
      expect(res.status).toBe(400);
      expect(await json<{ error: string }>(res)).toMatchObject({ error: 'validation_error' });
    }
  });
});
