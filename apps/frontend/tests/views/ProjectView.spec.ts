import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { ProjectRole, Task, TaskComment } from '@pm-tool/shared';
import ProjectView from '../../src/views/ProjectView.vue';
import {
  alice,
  bob,
  json,
  makeMember,
  makeProject,
  makeTask,
  noContent,
  stubApi,
} from '../helpers/api-mock';
import { inputValue, mountAt } from '../helpers/mount';

function makeComment(overrides: Partial<TaskComment> = {}): TaskComment {
  return {
    id: 'c1',
    taskId: 't1',
    author: bob,
    body: 'Looks good',
    createdAt: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

function baseRoutes(role: ProjectRole, tasks: () => Task[] = () => [makeTask({ assignee: bob })]) {
  return {
    'GET /api/projects/p1': json(makeProject({ role })),
    'GET /api/projects/p1/tasks': () => json(tasks()),
    'GET /api/projects/p1/members': json([
      makeMember(alice, { role: 'admin', isOwner: true }),
      makeMember(bob, { role }),
    ]),
    'GET /api/projects/p1/tasks/t1/comments': json([makeComment()]),
  };
}

describe('ProjectView', () => {
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
    let tasks = [makeTask({ assignee: bob })];
    const requests = stubApi({
      ...baseRoutes('admin', () => tasks),
      'POST /api/projects/p1/tasks': () => {
        const created = makeTask({ id: 't2', title: 'New task' });
        tasks = [...tasks, created];
        return json(created, 201);
      },
      'PATCH /api/projects/p1/tasks/t1': (body) => {
        const current = tasks[0] ?? makeTask();
        const patch = body as { status?: Task['status']; assigneeId?: string | null };
        const updated = makeTask({
          ...current,
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.assigneeId !== undefined
            ? { assignee: patch.assigneeId === bob.id ? bob : null }
            : {}),
        });
        tasks = [updated, ...tasks.slice(1)];
        return json(updated);
      },
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);

    await wrapper.get('input[aria-label="TODO のタイトル"]').setValue('New task');
    await wrapper.get('[data-testid="create-task"]').trigger('submit');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="task"]').map((t) => t.get('button.link').text())).toEqual(
      ['Write spec', 'New task'],
    );
    expect(inputValue(wrapper.get('input[aria-label="TODO のタイトル"]'))).toBe('');

    await wrapper.get('[data-testid="task"] input[type="checkbox"]').setValue(true);
    await flushPromises();
    expect(wrapper.get('[data-testid="task"]').classes()).toContain('done');

    await wrapper.get('[data-testid="task"] select').setValue('');
    await flushPromises();
    expect(inputValue(wrapper.get('[data-testid="task"] select'))).toBe('');

    const calls = requests.mock.calls.map(([req]) => req);
    expect(calls.filter((req) => req.method === 'POST').map((req) => req.body)).toEqual([
      { title: 'New task' },
    ]);
    expect(calls.filter((req) => req.method === 'PATCH').map((req) => req.body)).toEqual([
      { status: 'done' },
      { assigneeId: null },
    ]);
  });

  it('removes a deleted task and closes its thread when it was selected', async () => {
    let tasks = [makeTask(), makeTask({ id: 't2', title: 'Second' })];
    stubApi({
      ...baseRoutes('admin', () => tasks),
      'DELETE /api/projects/p1/tasks/t1': () => {
        tasks = tasks.filter((task) => task.id !== 't1');
        return noContent();
      },
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    await wrapper.get('[data-testid="task"] button.link').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="thread"]').text()).toContain('Looks good');

    const deleteButton = wrapper
      .get('[data-testid="task"]')
      .findAll('button')
      .find((b) => b.text() === '削除');
    await deleteButton?.trigger('click');
    await flushPromises();

    expect(wrapper.findAll('[data-testid="task"]').map((t) => t.get('button.link').text())).toEqual(
      ['Second'],
    );
    expect(wrapper.get('[data-testid="thread"]').text()).toBe(
      'TODO を選択するとスレッドが表示されます',
    );
  });

  it('opens a thread and posts a comment', async () => {
    let comments = [makeComment()];
    const requests = stubApi({
      ...baseRoutes('admin'),
      'GET /api/projects/p1/tasks/t1/comments': () => json(comments),
      'POST /api/projects/p1/tasks/t1/comments': () => {
        const posted = makeComment({ id: 'c2', author: alice, body: 'Thanks' });
        comments = [...comments, posted];
        return json(posted, 201);
      },
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    await wrapper.get('[data-testid="task"] button.link').trigger('click');
    await flushPromises();

    await wrapper.get('textarea[aria-label="コメント"]').setValue('Thanks');
    await wrapper.get('[data-testid="create-comment"]').trigger('submit');
    await flushPromises();

    const rendered = wrapper.findAll('[data-testid="comment"]');
    expect(rendered.map((c) => c.text())).toEqual([
      expect.stringContaining('Bob'),
      expect.stringContaining('Alice'),
    ]);
    expect(inputValue(wrapper.get('textarea[aria-label="コメント"]'))).toBe('');
    const postCall = requests.mock.calls
      .map(([req]) => req)
      .find((req) => req.path.endsWith('/comments') && req.method === 'POST');
    expect(postCall?.body).toEqual({ body: 'Thanks' });
  });

  it('ignores a stale comment response after another task was selected', async () => {
    let resolveFirst!: (res: Response) => void;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    stubApi({
      ...baseRoutes('admin', () => [makeTask(), makeTask({ id: 't2', title: 'Second' })]),
      'GET /api/projects/p1/tasks/t1/comments': () => first,
      'GET /api/projects/p1/tasks/t2/comments': json([
        makeComment({ id: 'c-t2', taskId: 't2', body: 'Second thread' }),
      ]),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    const [firstTask, secondTask] = wrapper.findAll('[data-testid="task"] button.link');
    await firstTask?.trigger('click');
    await flushPromises();
    await secondTask?.trigger('click');
    await flushPromises();
    resolveFirst(json([makeComment({ body: 'First thread' })]));
    await flushPromises();

    const thread = wrapper.get('[data-testid="thread"]');
    expect(thread.get('h3').text()).toBe('Second');
    expect(
      wrapper.findAll('[data-testid="comment"]').map((c) => c.get('.comment-body').text()),
    ).toEqual(['Second thread']);
  });

  it('shows a comment load error inside the thread', async () => {
    stubApi({
      ...baseRoutes('admin'),
      'GET /api/projects/p1/tasks/t1/comments': json({ error: 'internal_error' }, 500),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    await wrapper.get('[data-testid="task"] button.link').trigger('click');
    await flushPromises();

    const thread = wrapper.get('[data-testid="thread"]');
    expect(thread.get('[role="alert"]').text()).toBe('コメントの読み込みに失敗しました');
    expect(thread.text()).not.toContain('コメントはありません');
  });

  it('shows an action error when the assignee is not a member', async () => {
    stubApi({
      ...baseRoutes('admin'),
      'PATCH /api/projects/p1/tasks/t1': json({ error: 'assignee_not_member' }, 400),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    await wrapper.get('[data-testid="task"] select').setValue(alice.id);
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe(
      '担当者はプロジェクトメンバーから選んでください',
    );
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
