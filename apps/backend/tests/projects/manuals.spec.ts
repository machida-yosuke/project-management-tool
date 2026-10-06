import { describe, expect, it } from 'vitest';
import {
  emptyRichTextDoc,
  RICH_TEXT_MAX_BYTES,
  type RichTextDoc,
  type UserSummary,
} from '@pm-tool/shared';
import { api, json, richText, setupProject, type TestUser } from './helpers';

interface ManualPageSummary {
  id: string;
  projectId: string;
  title: string;
  createdBy: UserSummary;
  createdAt: string;
  updatedAt: string;
}

interface ManualPage extends ManualPageSummary {
  body: RichTextDoc;
}

function toSummary(page: ManualPage): ManualPageSummary {
  const { id, projectId, title, createdBy, createdAt, updatedAt } = page;
  return { id, projectId, title, createdBy, createdAt, updatedAt };
}

// Timestamps have millisecond precision, so consecutive writes need a gap to compare.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

async function createPage(
  user: TestUser,
  projectId: string,
  body: { title: string; body?: unknown },
): Promise<ManualPage> {
  const res = await api(user, `/api/projects/${projectId}/manuals`, { method: 'POST', body });
  if (res.status !== 201) throw new Error(`createPage failed: ${res.status}`);
  return json<ManualPage>(res);
}

async function search(user: TestUser, projectId: string, q: string): Promise<string[]> {
  const res = await api(user, `/api/projects/${projectId}/manuals?q=${encodeURIComponent(q)}`);
  expect(res.status).toBe(200);
  return (await json<ManualPageSummary[]>(res)).map((page) => page.title);
}

describe('manuals routes', () => {
  it('creates, lists, reads, updates and deletes manual pages', async () => {
    const { project, staff, substaff } = await setupProject();
    const base = `/api/projects/${project.id}/manuals`;

    const res = await api(staff, base, {
      method: 'POST',
      body: { title: ' 手順書 ', body: richText('本文') },
    });
    expect(res.status).toBe(201);
    const page = await json<ManualPage>(res);
    expect(page).toEqual({
      id: page.id,
      projectId: project.id,
      title: '手順書',
      body: richText('本文'),
      createdBy: { id: staff.id, email: staff.email, name: staff.name, avatarUrl: null },
      createdAt: page.createdAt,
      updatedAt: page.createdAt,
    });
    expect(new Date(page.createdAt).toISOString()).toBe(page.createdAt);
    const second = await createPage(staff, project.id, { title: '二つ目' });
    expect(second.body).toEqual(emptyRichTextDoc());

    const listed = await api(substaff, base);
    expect(listed.status).toBe(200);
    expect(await json<ManualPageSummary[]>(listed)).toEqual([page, second].map(toSummary));

    const fetched = await api(substaff, `${base}/${page.id}`);
    expect(fetched.status).toBe(200);
    expect(await json<ManualPage>(fetched)).toEqual(page);

    await tick();
    const renamed = await json<ManualPage>(
      await api(staff, `${base}/${page.id}`, { method: 'PATCH', body: { title: ' 改訂版 ' } }),
    );
    expect(renamed).toMatchObject({ title: '改訂版', body: richText('本文') });
    expect(renamed.updatedAt > page.updatedAt).toBe(true);
    expect(renamed.createdAt).toBe(page.createdAt);

    await tick();
    const rewritten = await api(staff, `${base}/${page.id}`, {
      method: 'PATCH',
      body: { body: richText('新しい本文') },
    });
    expect(rewritten.status).toBe(200);
    const rewrittenPage = await json<ManualPage>(rewritten);
    expect(rewrittenPage).toMatchObject({ title: '改訂版', body: richText('新しい本文') });
    expect(rewrittenPage.updatedAt > renamed.updatedAt).toBe(true);
    expect(await search(staff, project.id, '新しい')).toEqual(['改訂版']);

    expect((await api(staff, `${base}/${page.id}`, { method: 'DELETE' })).status).toBe(204);
    const gone = await api(staff, `${base}/${page.id}`);
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: 'not_found' });
    expect(
      (await api(staff, `${base}/${page.id}`, { method: 'PATCH', body: { title: 'X' } })).status,
    ).toBe(404);
    expect((await api(staff, `${base}/${page.id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await json<ManualPageSummary[]>(await api(staff, base))).map((p) => p.id)).toEqual([
      second.id,
    ]);
  });

  it('searches titles and body text case-insensitively', async () => {
    const { project, admin } = await setupProject();
    await createPage(admin, project.id, { title: 'Deploy Guide', body: richText('手順') });
    await createPage(admin, project.id, {
      title: '障害対応',
      body: richText('Restart the WORKER'),
    });
    await createPage(admin, project.id, { title: '100% 達成', body: richText('a_b') });
    await createPage(admin, project.id, { title: '1000 件', body: richText('axb') });

    expect(await search(admin, project.id, 'deploy')).toEqual(['Deploy Guide']);
    expect(await search(admin, project.id, 'worker')).toEqual(['障害対応']);
    expect(await search(admin, project.id, ' 手順 ')).toEqual(['Deploy Guide']);
    expect(await search(admin, project.id, '0%')).toEqual(['100% 達成']);
    expect(await search(admin, project.id, 'a_b')).toEqual(['100% 達成']);
    expect(await search(admin, project.id, '\\')).toEqual([]);
    expect(await search(admin, project.id, 'missing')).toEqual([]);
    expect(await search(admin, project.id, '   ')).toHaveLength(4);
    expect(await search(admin, project.id, '')).toHaveLength(4);
  });

  it('does not search the title through the body or images', async () => {
    const { project, admin } = await setupProject();
    const image = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'image',
              attrs: { src: `/api/projects/${project.id}/attachments/${crypto.randomUUID()}` },
            },
          ],
        },
      ],
    };
    const page = await createPage(admin, project.id, { title: '画像', body: image });
    expect(page.body).toEqual(image);
    expect(await search(admin, project.id, 'attachments')).toEqual([]);
  });

  it('lets substaff read but not write, and hides pages from non-members', async () => {
    const { project, admin, substaff, outsider } = await setupProject();
    const base = `/api/projects/${project.id}/manuals`;
    const page = await createPage(admin, project.id, { title: 'T' });
    const url = `${base}/${page.id}`;

    expect((await api(substaff, base)).status).toBe(200);
    expect((await api(substaff, url)).status).toBe(200);
    const create = await api(substaff, base, { method: 'POST', body: { title: 'X' } });
    expect(create.status).toBe(403);
    expect(await create.json()).toEqual({ error: 'forbidden' });
    expect((await api(substaff, url, { method: 'PATCH', body: { title: 'X' } })).status).toBe(403);
    expect((await api(substaff, url, { method: 'DELETE' })).status).toBe(403);

    expect((await api(outsider, base)).status).toBe(404);
    expect((await api(outsider, url)).status).toBe(404);
    expect((await api(outsider, base, { method: 'POST', body: { title: 'X' } })).status).toBe(404);
    expect((await api(outsider, url, { method: 'PATCH', body: { title: 'X' } })).status).toBe(404);
    expect((await api(outsider, url, { method: 'DELETE' })).status).toBe(404);

    expect((await api(null, base)).status).toBe(401);
    expect((await api(null, url)).status).toBe(401);
    expect((await json<ManualPage>(await api(admin, url))).title).toBe('T');
  });

  it('does not expose pages through another project', async () => {
    const a = await setupProject();
    const b = await setupProject();
    const page = await createPage(a.admin, a.project.id, { title: 'T' });
    const url = `/api/projects/${b.project.id}/manuals/${page.id}`;

    for (const res of [
      await api(b.admin, url),
      await api(b.admin, url, { method: 'PATCH', body: { title: 'hijack' } }),
      await api(b.admin, url, { method: 'DELETE' }),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
    expect(
      await json<ManualPage[]>(await api(b.admin, `/api/projects/${b.project.id}/manuals`)),
    ).toEqual([]);
    expect(
      await json<ManualPage>(
        await api(a.admin, `/api/projects/${a.project.id}/manuals/${page.id}`),
      ),
    ).toEqual(page);
  });

  it('validates titles and bodies', async () => {
    const { project, admin } = await setupProject();
    const other = await setupProject();
    const base = `/api/projects/${project.id}/manuals`;
    const page = await createPage(admin, project.id, { title: 'T' });
    const invalidBodies = [
      { type: 'doc', content: [{ type: 'horizontalRule' }] },
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'image',
                attrs: {
                  src: `/api/projects/${other.project.id}/attachments/${crypto.randomUUID()}`,
                },
              },
            ],
          },
        ],
      },
      richText('あ'.repeat(Math.ceil(RICH_TEXT_MAX_BYTES / 3) + 1)),
      'plain text',
      null,
    ];

    for (const body of [
      { title: '' },
      { title: '   ' },
      { title: 'a'.repeat(201) },
      {},
      ...invalidBodies.map((b) => ({ title: 'T', body: b })),
    ]) {
      const res = await api(admin, base, { method: 'POST', body });
      expect(res.status).toBe(400);
      expect(await json<{ error: string }>(res)).toMatchObject({ error: 'validation_error' });
    }
    for (const body of [
      { title: '  ' },
      { title: 'a'.repeat(201) },
      ...invalidBodies.map((b) => ({ body: b })),
    ]) {
      const res = await api(admin, `${base}/${page.id}`, { method: 'PATCH', body });
      expect(res.status).toBe(400);
      expect(await json<{ error: string }>(res)).toMatchObject({ error: 'validation_error' });
    }

    expect(
      (await api(admin, base, { method: 'POST', body: { title: 'a'.repeat(200) } })).status,
    ).toBe(201);
    expect(await json<ManualPage>(await api(admin, `${base}/${page.id}`))).toEqual(page);
  });
});
