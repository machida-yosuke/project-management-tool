import { enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plainTextToRichTextDoc, type ProjectRole } from '@pm-tool/shared';
import type { ManualPage } from '../../src/api/generated/models';
import ProjectManualsView from '../../src/views/ProjectManualsView.vue';
import { alice, bob, json, makeManualPage, makeProject, stubApi } from '../helpers/api-mock';
import { currentDialog, openDialog } from '../helpers/dialog';
import { inputValue, mountAt } from '../helpers/mount';
import { replaceContent } from '../helpers/rich-text';

const PATH = '/projects/p1/manuals';
const SEARCH = 'input[aria-label="マニュアルを検索"]';
const ONBOARDING = makeManualPage({ id: 'm1', title: 'Onboarding' });
const DEPLOY = makeManualPage({
  id: 'm2',
  title: 'Deploy steps',
  updatedAt: '2026-09-03T00:00:00.000Z',
});

function summary(page: ManualPage) {
  const { id, projectId, title, createdBy, createdAt, updatedAt } = page;
  return { id, projectId, title, createdBy, createdAt, updatedAt };
}

function baseRoutes(role: ProjectRole, manuals: () => ManualPage[] = () => [ONBOARDING, DEPLOY]) {
  return {
    'GET /api/projects/p1': json(makeProject({ role })),
    'GET /api/projects/p1/manuals': () => json(manuals().map(summary)),
  };
}

function titles(wrapper: { findAll: (selector: string) => { text: () => string }[] }) {
  return wrapper.findAll('[data-testid="manual"] [data-testid="manual-open"]').map((a) => a.text());
}

function requestLines(requests: ReturnType<typeof stubApi>) {
  return requests.mock.calls.map(([req]) => `${req.method} ${req.path}`);
}

async function waitForSearch() {
  await new Promise((resolve) => setTimeout(resolve, 350));
  await flushPromises();
}

describe('ProjectManualsView', () => {
  enableAutoUnmount(afterEach);

  beforeEach(() => {
    localStorage.clear();
  });

  it('lists pages with links to their detail pages under the manuals tab', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-04T00:00:00.000Z'));
    try {
      stubApi(baseRoutes('substaff'));

      const { wrapper, router } = await mountAt(ProjectManualsView, PATH, bob);

      expect(wrapper.get('nav a[aria-current="page"]').text()).toBe('マニュアル');
      const links = wrapper.findAll('[data-testid="manual-open"]');
      expect(links.map((a) => [a.text(), a.attributes('href')])).toEqual([
        ['Onboarding', '/projects/p1/manuals/m1'],
        ['Deploy steps', '/projects/p1/manuals/m2'],
      ]);
      expect(wrapper.get('[data-testid="manual-count"]').text()).toBe('ページ 2 件');
      expect(
        wrapper.findAll('[data-testid="manual-meta"]').map((m) => m.text().replace(/\s+/g, ' ')),
      ).toEqual(['Alice が 3 日前 に作成', 'Alice が 3 日前 に作成 · 1 日前に更新']);
      expect(
        wrapper.findAll('[data-testid="manual-created-by"]').map((a) => a.attributes('title')),
      ).toEqual(['Alice', 'Alice']);

      await links[1]?.trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.name).toBe('manual');
      expect(router.currentRoute.value.params).toEqual({ projectId: 'p1', manualId: 'm2' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('searches on the server after typing stops and keeps the query in the URL', async () => {
    const requests = stubApi({
      ...baseRoutes('staff'),
      'GET /api/projects/p1/manuals?q=deploy': json([summary(DEPLOY)]),
    });

    const { wrapper, router } = await mountAt(ProjectManualsView, PATH, bob);
    await wrapper.get(SEARCH).setValue(' deploy ');
    await flushPromises();
    expect(requestLines(requests)).not.toContain('GET /api/projects/p1/manuals?q=deploy');

    await waitForSearch();

    expect(router.currentRoute.value.query).toEqual({ q: 'deploy' });
    expect(requestLines(requests)).toContain('GET /api/projects/p1/manuals?q=deploy');
    expect(titles(wrapper)).toEqual(['Deploy steps']);
    expect(wrapper.get('[data-testid="manual-count"]').text()).toBe('検索結果 1 件');
    expect(inputValue(wrapper.get(SEARCH))).toBe(' deploy ');

    await wrapper.get(SEARCH).setValue('');
    await waitForSearch();

    expect(router.currentRoute.value.query).toEqual({});
    expect(titles(wrapper)).toEqual(['Onboarding', 'Deploy steps']);
  });

  it('restores the search from the URL', async () => {
    const requests = stubApi({
      ...baseRoutes('staff'),
      'GET /api/projects/p1/manuals?q=deploy': json([summary(DEPLOY)]),
    });

    const { wrapper } = await mountAt(ProjectManualsView, `${PATH}?q=deploy`, bob);

    expect(inputValue(wrapper.get(SEARCH))).toBe('deploy');
    expect(requestLines(requests)).toEqual([
      'GET /api/projects/p1',
      'GET /api/projects/p1/manuals?q=deploy',
    ]);
    expect(titles(wrapper)).toEqual(['Deploy steps']);
  });

  it('offers to create the first page when there are none', async () => {
    stubApi(baseRoutes('staff', () => []));

    const { wrapper } = await mountAt(ProjectManualsView, PATH, bob);

    expect(wrapper.text()).toContain('マニュアルはまだありません');
    expect(wrapper.findAll('button').filter((b) => b.text() === 'ページを作成')).toHaveLength(2);
  });

  it('shows a separate empty state when the search matches nothing', async () => {
    stubApi({
      ...baseRoutes('staff'),
      'GET /api/projects/p1/manuals?q=missing': json([]),
    });

    const { wrapper } = await mountAt(ProjectManualsView, `${PATH}?q=missing`, bob);

    expect(wrapper.text()).toContain('該当するマニュアルはありません');
    expect(wrapper.text()).not.toContain('マニュアルはまだありません');
    expect(wrapper.findAll('button').filter((b) => b.text() === 'ページを作成')).toHaveLength(1);
  });

  it('creates a page from the dialog and opens it', async () => {
    let manuals = [ONBOARDING];
    const requests = stubApi({
      ...baseRoutes('admin', () => manuals),
      'POST /api/projects/p1/manuals': (body) => {
        const request = body as Pick<ManualPage, 'title' | 'body'>;
        const created = makeManualPage({ id: 'm3', ...request });
        manuals = [...manuals, created];
        return json(created, 201);
      },
    });

    const { wrapper, router } = await mountAt(ProjectManualsView, PATH, alice);
    const dialog = await openDialog(wrapper, 'ページを作成');
    const form = dialog.get('[data-testid="create-manual"]');
    await form.get('input[aria-label="ページのタイトル"]').setValue(' Release flow ');
    await replaceContent(form, 'ページの本文', 'Tag and push');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(localStorage.getItem('draft:project:p1:new-manual')).not.toBeNull();

    await form.trigger('submit');
    await flushPromises();

    expect(requests.mock.calls.map(([req]) => req).filter((req) => req.method === 'POST')).toEqual([
      {
        method: 'POST',
        path: '/api/projects/p1/manuals',
        body: { title: 'Release flow', body: plainTextToRichTextDoc('Tag and push') },
      },
    ]);
    expect(currentDialog()).toBeNull();
    expect(localStorage.getItem('draft:project:p1:new-manual')).toBeNull();
    expect(router.currentRoute.value.name).toBe('manual');
    expect(router.currentRoute.value.params).toEqual({ projectId: 'p1', manualId: 'm3' });
    expect(titles(wrapper)).toEqual(['Onboarding', 'Release flow']);
  });

  it('creates a page without a body', async () => {
    const requests = stubApi({
      ...baseRoutes('staff'),
      'POST /api/projects/p1/manuals': json(makeManualPage({ id: 'm3', title: 'Empty' }), 201),
    });

    const { wrapper } = await mountAt(ProjectManualsView, PATH, bob);
    const dialog = await openDialog(wrapper, 'ページを作成');
    await dialog.get('input[aria-label="ページのタイトル"]').setValue('Empty');
    await dialog.get('[data-testid="create-manual"]').trigger('submit');
    await flushPromises();

    expect(
      requests.mock.calls.map(([req]) => req.body).filter((body) => body !== undefined),
    ).toEqual([{ title: 'Empty' }]);
  });

  it('hides the create button for substaff', async () => {
    stubApi(baseRoutes('substaff', () => []));

    const { wrapper } = await mountAt(ProjectManualsView, PATH, bob);

    expect(wrapper.text()).toContain('マニュアルはまだありません');
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('ページを作成');
  });

  it('shows not found for projects the user is not a member of', async () => {
    stubApi({
      'GET /api/projects/p1': json({ error: 'not_found' }, 404),
      'GET /api/projects/p1/manuals': json({ error: 'not_found' }, 404),
    });

    const { wrapper } = await mountAt(ProjectManualsView, PATH, bob);

    expect(wrapper.get('[data-testid="project-not-found"]').text()).toContain(
      'プロジェクトが見つかりません',
    );
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
