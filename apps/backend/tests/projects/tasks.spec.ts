import { describe, expect, it } from 'vitest';
import type { Task } from '@pm-tool/shared';
import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { emptyRichTextDoc, RICH_TEXT_MAX_BYTES } from '@pm-tool/shared';
import { tasks } from '../../src/db/schema';
import { api, json, richText, setupProject } from './helpers';

describe('tasks routes', () => {
  it('creates, lists in creation order, updates, and archives tasks', async () => {
    const { project, admin, staff, substaff } = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;

    const first = await api(staff, base, {
      method: 'POST',
      body: { title: ' First ', description: richText('d') },
    });
    expect(first.status).toBe(201);
    const firstTask = await json<Task>(first);
    expect(firstTask).toMatchObject({
      projectId: project.id,
      title: 'First',
      description: richText('d'),
      descriptionEditedAt: null,
      status: 'open',
      assignee: null,
      startDate: null,
      endDate: null,
      color: 'gray',
      archivedAt: null,
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
      description: richText('d'),
      descriptionEditedAt: null,
      assignee: { id: admin.id },
    });

    const unassigned = await json<Task>(
      await api(staff, `${base}/${firstTask.id}`, { method: 'PATCH', body: { assigneeId: null } }),
    );
    expect(unassigned.assignee).toBeNull();
    expect(unassigned.status).toBe('done');

    expect((await api(staff, `${base}/${second.id}/archive`, { method: 'POST' })).status).toBe(200);
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
    for (const action of ['archive', 'unarchive']) {
      expect((await api(substaff, `${base}/${task.id}/${action}`, { method: 'POST' })).status).toBe(
        403,
      );
    }
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
    for (const action of ['archive', 'unarchive']) {
      expect((await api(outsider, `${base}/${task.id}/${action}`, { method: 'POST' })).status).toBe(
        404,
      );
    }
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
    for (const action of ['archive', 'unarchive']) {
      const archived = await api(
        b.admin,
        `/api/projects/${b.project.id}/tasks/${task.id}/${action}`,
        {
          method: 'POST',
        },
      );
      expect(archived.status).toBe(404);
    }
  });

  it('validates task input', async () => {
    const { project, admin } = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;
    for (const body of [
      { title: '' },
      { title: 'a'.repeat(201) },
      { title: 'T', description: 'plain text' },
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

  it('archives and unarchives idempotently', async () => {
    const { project, admin, staff } = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;
    const first = await json<Task>(
      await api(admin, base, { method: 'POST', body: { title: 'A' } }),
    );
    const second = await json<Task>(
      await api(admin, base, { method: 'POST', body: { title: 'B' } }),
    );

    const archivedRes = await api(staff, `${base}/${first.id}/archive`, { method: 'POST' });
    expect(archivedRes.status).toBe(200);
    const archived = await json<Task>(archivedRes);
    expect(archived.archivedAt).toEqual(new Date(archived.archivedAt!).toISOString());

    expect((await json<Task[]>(await api(admin, base))).map((t) => t.id)).toEqual([second.id]);
    for (const flag of ['true', '1']) {
      const listed = await json<Task[]>(await api(admin, `${base}?includeArchived=${flag}`));
      expect(listed.map((t) => t.id)).toEqual([first.id, second.id]);
    }
    for (const flag of ['false', '0']) {
      const listed = await json<Task[]>(await api(admin, `${base}?includeArchived=${flag}`));
      expect(listed.map((t) => t.id)).toEqual([second.id]);
    }

    const again = await api(staff, `${base}/${first.id}/archive`, { method: 'POST' });
    expect(again.status).toBe(200);
    expect(await json<Task>(again)).toMatchObject({
      archivedAt: archived.archivedAt,
      updatedAt: archived.updatedAt,
    });

    const restoredRes = await api(staff, `${base}/${first.id}/unarchive`, { method: 'POST' });
    expect(restoredRes.status).toBe(200);
    const restored = await json<Task>(restoredRes);
    expect(restored.archivedAt).toBeNull();

    const restoredAgain = await api(staff, `${base}/${first.id}/unarchive`, { method: 'POST' });
    expect(restoredAgain.status).toBe(200);
    expect(await json<Task>(restoredAgain)).toMatchObject({
      archivedAt: null,
      updatedAt: restored.updatedAt,
    });
    expect((await json<Task[]>(await api(admin, base))).map((t) => t.id)).toEqual([
      first.id,
      second.id,
    ]);

    const bad = await api(admin, `${base}?includeArchived=yes`);
    expect(bad.status).toBe(400);
    expect(await json<{ error: string }>(bad)).toMatchObject({ error: 'validation_error' });
  });

  it('keeps archived tasks editable and commentable', async () => {
    const { project, admin, staff } = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;
    const task = await json<Task>(await api(admin, base, { method: 'POST', body: { title: 'T' } }));
    const archived = await json<Task>(
      await api(admin, `${base}/${task.id}/archive`, { method: 'POST' }),
    );

    const patched = await api(staff, `${base}/${task.id}`, {
      method: 'PATCH',
      body: { title: 'Renamed' },
    });
    expect(patched.status).toBe(200);
    expect(await json<Task>(patched)).toMatchObject({
      title: 'Renamed',
      archivedAt: archived.archivedAt,
    });

    const comments = `${base}/${task.id}/comments`;
    expect(
      (await api(staff, comments, { method: 'POST', body: { body: richText('hi') } })).status,
    ).toBe(201);
    const listed = await api(admin, comments);
    expect(listed.status).toBe(200);
    expect(await json<unknown[]>(listed)).toHaveLength(1);
  });

  it('stores dates and colors and enforces a complete, ordered range', async () => {
    const { project, admin } = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;

    const created = await api(admin, base, {
      method: 'POST',
      body: { title: 'T', startDate: '2026-10-01', endDate: '2026-10-03', color: 'teal' },
    });
    expect(created.status).toBe(201);
    const task = await json<Task>(created);
    expect(task).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-03', color: 'teal' });
    const url = `${base}/${task.id}`;

    const moved = await api(admin, url, { method: 'PATCH', body: { startDate: '2026-10-02' } });
    expect(moved.status).toBe(200);
    expect(await json<Task>(moved)).toMatchObject({
      startDate: '2026-10-02',
      endDate: '2026-10-03',
      color: 'teal',
    });

    const inverted = await api(admin, url, { method: 'PATCH', body: { endDate: '2026-10-01' } });
    expect(inverted.status).toBe(400);
    expect(await inverted.json()).toEqual({ error: 'invalid_date_range' });

    const halfCleared = await api(admin, url, { method: 'PATCH', body: { startDate: null } });
    expect(halfCleared.status).toBe(400);
    expect(await halfCleared.json()).toEqual({ error: 'invalid_date_range' });

    const cleared = await api(admin, url, {
      method: 'PATCH',
      body: { startDate: null, endDate: null },
    });
    expect(cleared.status).toBe(200);
    expect(await json<Task>(cleared)).toMatchObject({ startDate: null, endDate: null });

    const halfSet = await api(admin, url, { method: 'PATCH', body: { endDate: '2026-10-05' } });
    expect(halfSet.status).toBe(400);
    expect(await halfSet.json()).toEqual({ error: 'invalid_date_range' });

    const sameDay = await api(admin, url, {
      method: 'PATCH',
      body: { startDate: '2026-10-05', endDate: '2026-10-05', color: 'red' },
    });
    expect(sameDay.status).toBe(200);
    expect(await json<Task>(sameDay)).toMatchObject({
      startDate: '2026-10-05',
      endDate: '2026-10-05',
      color: 'red',
    });

    for (const body of [
      { title: 'T', startDate: '2026-10-01' },
      { title: 'T', endDate: '2026-10-01' },
      { title: 'T', startDate: '2026-10-01', endDate: null },
      { title: 'T', startDate: '2026-10-03', endDate: '2026-10-01' },
    ]) {
      const res = await api(admin, base, { method: 'POST', body });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_date_range' });
    }
  });

  it('rejects malformed dates and unknown colors', async () => {
    const { project, admin } = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;
    const task = await json<Task>(await api(admin, base, { method: 'POST', body: { title: 'T' } }));

    for (const date of ['2026-02-30', '2026/10/01', '20261001', '2026-10-01T00:00:00Z', '']) {
      const create = await api(admin, base, {
        method: 'POST',
        body: { title: 'T', startDate: date, endDate: '2026-12-31' },
      });
      expect(create.status).toBe(400);
      expect(await json<{ error: string }>(create)).toMatchObject({ error: 'validation_error' });

      const patch = await api(admin, `${base}/${task.id}`, {
        method: 'PATCH',
        body: { startDate: '2026-01-01', endDate: date },
      });
      expect(patch.status).toBe(400);
      expect(await json<{ error: string }>(patch)).toMatchObject({ error: 'validation_error' });
    }

    const leapDay = await api(admin, base, {
      method: 'POST',
      body: { title: 'T', startDate: '2028-02-29', endDate: '2028-02-29' },
    });
    expect(leapDay.status).toBe(201);

    for (const res of [
      await api(admin, base, { method: 'POST', body: { title: 'T', color: 'pink' } }),
      await api(admin, `${base}/${task.id}`, { method: 'PATCH', body: { color: 'pink' } }),
    ]) {
      expect(res.status).toBe(400);
      expect(await json<{ error: string }>(res)).toMatchObject({ error: 'validation_error' });
    }
  });

  it('stores rich text descriptions and defaults to the empty document', async () => {
    const { project, admin } = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;
    const plain = await json<Task>(
      await api(admin, base, { method: 'POST', body: { title: 'T' } }),
    );
    expect(plain.description).toEqual(emptyRichTextDoc());

    const description = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Spec' }] },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'see',
              marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank' } }],
            },
          ],
        },
        { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'x' }] },
      ],
    };
    const created = await api(admin, base, { method: 'POST', body: { title: 'T', description } });
    expect(created.status).toBe(201);
    const task = await json<Task>(created);
    const normalized = {
      type: 'doc',
      content: [
        description.content[0],
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'see',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
        { type: 'codeBlock', content: [{ type: 'text', text: 'x' }] },
      ],
    };
    expect(task.description).toEqual(normalized);
    const [listed] = (await json<Task[]>(await api(admin, base))).filter((t) => t.id === task.id);
    expect(listed?.description).toEqual(normalized);

    const updated = await api(admin, `${base}/${task.id}`, {
      method: 'PATCH',
      body: { description: richText('new') },
    });
    expect(updated.status).toBe(200);
    expect((await json<Task>(updated)).description).toEqual(richText('new'));
  });

  it('rejects invalid rich text descriptions', async () => {
    const { project, admin } = await setupProject();
    const other = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;
    const task = await json<Task>(await api(admin, base, { method: 'POST', body: { title: 'T' } }));
    const attachmentId = crypto.randomUUID();
    const image = (src: string) => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src } }] }],
    });

    for (const description of [
      { type: 'doc', content: [{ type: 'horizontalRule' }] },
      image('data:image/png;base64,AAAA'),
      image(`/api/projects/${other.project.id}/attachments/${attachmentId}`),
      richText('あ'.repeat(Math.ceil(RICH_TEXT_MAX_BYTES / 3) + 1)),
      null,
    ]) {
      for (const res of [
        await api(admin, base, { method: 'POST', body: { title: 'T', description } }),
        await api(admin, `${base}/${task.id}`, { method: 'PATCH', body: { description } }),
      ]) {
        expect(res.status).toBe(400);
        expect(await json<{ error: string }>(res)).toMatchObject({ error: 'validation_error' });
      }
    }

    const ownImage = image(`/api/projects/${project.id}/attachments/${attachmentId}`);
    const accepted = await api(admin, `${base}/${task.id}`, {
      method: 'PATCH',
      body: { description: ownImage },
    });
    expect(accepted.status).toBe(200);
    expect((await json<Task>(accepted)).description).toEqual(ownImage);
  });

  it('marks the description as edited only when its content changes', async () => {
    const { project, admin } = await setupProject();
    const base = `/api/projects/${project.id}/tasks`;
    const task = await json<Task>(
      await api(admin, base, { method: 'POST', body: { title: 'T', description: richText('a') } }),
    );
    expect(task.descriptionEditedAt).toBeNull();
    const url = `${base}/${task.id}`;

    for (const body of [
      { status: 'done' },
      { title: 'Renamed', color: 'red', startDate: '2026-10-01', endDate: '2026-10-02' },
      { description: richText('a') },
    ]) {
      const res = await api(admin, url, { method: 'PATCH', body });
      expect(res.status).toBe(200);
      expect((await json<Task>(res)).descriptionEditedAt).toBeNull();
    }

    const edited = await json<Task>(
      await api(admin, url, { method: 'PATCH', body: { description: richText('b') } }),
    );
    expect(edited.descriptionEditedAt).toEqual(new Date(edited.descriptionEditedAt!).toISOString());

    const statusOnly = await json<Task>(
      await api(admin, url, { method: 'PATCH', body: { status: 'open' } }),
    );
    expect(statusOnly.descriptionEditedAt).toBe(edited.descriptionEditedAt);
  });

  it('returns legacy plain text descriptions as paragraphs', async () => {
    const { project, admin } = await setupProject();
    const id = crypto.randomUUID();
    const now = new Date();
    await drizzle(env.DB).insert(tasks).values({
      id,
      projectId: project.id,
      title: 'Legacy',
      description: 'hello\nworld',
      createdBy: admin.id,
      createdAt: now,
      updatedAt: now,
    });
    const base = `/api/projects/${project.id}/tasks`;
    const [legacy] = (await json<Task[]>(await api(admin, base))).filter((t) => t.id === id);
    expect(legacy?.description).toEqual(richText('hello', 'world'));

    const resaved = await api(admin, `${base}/${id}`, {
      method: 'PATCH',
      body: { description: richText('hello', 'world') },
    });
    expect(await json<Task>(resaved)).toMatchObject({
      description: richText('hello', 'world'),
      descriptionEditedAt: null,
    });
  });
});
