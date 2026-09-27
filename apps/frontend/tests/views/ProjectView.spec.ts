import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRole, TaskComment } from '@pm-tool/shared';
import ProjectView from '../../src/views/ProjectView.vue';
import { alice, bob, json, makeMember, makeProject, makeTask, stubApi } from '../helpers/api-mock';
import { inputValue, mountAt } from '../helpers/mount';

const comment: TaskComment = {
  id: 'c1',
  taskId: 't1',
  author: bob,
  body: 'Looks good',
  createdAt: '2026-09-02T00:00:00.000Z',
};

function baseRoutes(role: ProjectRole) {
  return {
    'GET /api/projects/p1': json(makeProject({ role })),
    'GET /api/projects/p1/tasks': json([makeTask({ assignee: bob })]),
    'GET /api/projects/p1/members': json([
      makeMember(alice, { role: 'admin', isOwner: true }),
      makeMember(bob, { role }),
    ]),
    'GET /api/projects/p1/tasks/t1/comments': json([comment]),
  };
}

describe('ProjectView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows edit controls for staff', async () => {
    stubApi(baseRoutes('staff'));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', bob);

    expect(wrapper.find('[data-testid="create-task"]').exists()).toBe(true);
    const task = wrapper.get('[data-testid="task"]');
    expect(task.find('input[type="checkbox"]').exists()).toBe(true);
    const select = task.get('select[aria-label="担当者"]');
    expect(inputValue(select)).toBe(bob.id);
    expect(select.findAll('option').map((o) => o.text())).toEqual(['未割り当て', 'Alice', 'Bob']);
    expect(task.text()).toContain('作成: Alice');
    expect(task.findAll('button').map((b) => b.text())).toContain('削除');
  });

  it('hides every edit control for substaff and shows names as text', async () => {
    stubApi(baseRoutes('substaff'));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', bob);

    expect(wrapper.find('[data-testid="create-task"]').exists()).toBe(false);
    const task = wrapper.get('[data-testid="task"]');
    expect(task.find('input[type="checkbox"]').exists()).toBe(false);
    expect(task.find('select').exists()).toBe(false);
    expect(task.findAll('button').map((b) => b.text())).not.toContain('削除');
    expect(task.text()).toContain('担当: Bob');

    await task.get('button.link').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="thread"]').text()).toContain('Looks good');
    expect(wrapper.find('[data-testid="create-comment"]').exists()).toBe(false);
  });

  it('adds a task, toggles completion and changes the assignee', async () => {
    const created = makeTask({ id: 't2', title: 'New task' });
    const fetchMock = stubApi({
      ...baseRoutes('admin'),
      'POST /api/projects/p1/tasks': () => json(created, 201),
      'PATCH /api/projects/p1/tasks/t1': (body) =>
        json(makeTask({ ...(body as object), assignee: bob, status: 'done' })),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);

    await wrapper.get('input[aria-label="TODO のタイトル"]').setValue('New task');
    await wrapper.get('[data-testid="create-task"]').trigger('submit');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="task"]')).toHaveLength(2);

    await wrapper.get('[data-testid="task"] input[type="checkbox"]').setValue(true);
    await flushPromises();
    await wrapper.get('[data-testid="task"] select').setValue('');
    await flushPromises();

    const patchBodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PATCH')
      .map(([, init]) => JSON.parse(init?.body as string) as unknown);
    expect(patchBodies).toEqual([{ status: 'done' }, { assigneeId: null }]);
  });

  it('opens a thread and posts a comment', async () => {
    const posted: TaskComment = { ...comment, id: 'c2', author: alice, body: 'Thanks' };
    const fetchMock = stubApi({
      ...baseRoutes('admin'),
      'POST /api/projects/p1/tasks/t1/comments': () => json(posted, 201),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    await wrapper.get('[data-testid="task"] button.link').trigger('click');
    await flushPromises();

    await wrapper.get('textarea[aria-label="コメント"]').setValue('Thanks');
    await wrapper.get('[data-testid="create-comment"]').trigger('submit');
    await flushPromises();

    const comments = wrapper.findAll('[data-testid="comment"]');
    expect(comments.map((c) => c.text())).toEqual([
      expect.stringContaining('Bob'),
      expect.stringContaining('Alice'),
    ]);
    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => url.endsWith('/comments') && init?.method === 'POST',
    );
    expect(JSON.parse(postCall?.[1]?.body as string)).toEqual({ body: 'Thanks' });
  });

  it('shows not found for projects the user is not a member of', async () => {
    stubApi({
      'GET /api/projects/p1': json({ error: 'not_found' }, 404),
      'GET /api/projects/p1/tasks': json({ error: 'not_found' }, 404),
      'GET /api/projects/p1/members': json({ error: 'not_found' }, 404),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', bob);

    expect(wrapper.get('[role="alert"]').text()).toBe('プロジェクトが見つかりません');
    expect(wrapper.find('[data-testid="task"]').exists()).toBe(false);
  });
});
