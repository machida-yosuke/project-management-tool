import { flushPromises, type DOMWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  plainTextToRichTextDoc,
  type ProjectRole,
  type Task,
  type TaskComment,
} from '@pm-tool/shared';
import ProjectView from '../../src/views/ProjectView.vue';
import { alice, bob, json, makeMember, makeProject, makeTask, stubApi } from '../helpers/api-mock';
import { inputValue, mountAt } from '../helpers/mount';
import { editorFor, replaceContent, typeInto } from '../helpers/rich-text';

function makeComment(overrides: Partial<TaskComment> = {}): TaskComment {
  return {
    id: 'c1',
    taskId: 't1',
    author: bob,
    body: plainTextToRichTextDoc('Looks good'),
    createdAt: '2026-09-02T00:00:00.000Z',
    editedAt: null,
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

function findButton(scope: Pick<DOMWrapper<Element>, 'findAll'>, text: string) {
  const button = scope.findAll('button').find((b) => b.text() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

describe('ProjectView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each([
    ['staff', true],
    ['substaff', false],
  ] as const)('shows the settings link for %s: %s', async (role, visible) => {
    stubApi(baseRoutes(role));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', bob);

    const link = wrapper.findAll('header a').find((a) => a.text() === '設定');
    expect(link?.attributes('href')).toBe(visible ? '/projects/p1/settings' : undefined);
  });

  it('shows the project description as rich text', async () => {
    stubApi({
      ...baseRoutes('staff'),
      'GET /api/projects/p1': json(
        makeProject({ role: 'staff', description: plainTextToRichTextDoc('Line 1\nLine 2') }),
      ),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', bob);

    const paragraphs = wrapper.get('[data-testid="project-description"]').findAll('p');
    expect(paragraphs.map((p) => p.text())).toEqual(['Line 1', 'Line 2']);
  });

  it('hides an empty project description', async () => {
    stubApi(baseRoutes('staff'));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', bob);

    expect(wrapper.find('[data-testid="project-description"]').exists()).toBe(false);
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
    expect(task.findAll('button').map((b) => b.text())).toContain('アーカイブ');
  });

  it('hides every edit control for substaff and shows names as text', async () => {
    stubApi(baseRoutes('substaff'));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', bob);

    expect(wrapper.find('[data-testid="create-task"]').exists()).toBe(false);
    const task = wrapper.get('[data-testid="task"]');
    expect(task.find('input[type="checkbox"]').exists()).toBe(false);
    expect(task.find('select').exists()).toBe(false);
    expect(task.findAll('button').map((b) => b.text())).not.toContain('アーカイブ');
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
      'GET /api/projects/p1/tasks/t2/comments': json([]),
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

    await wrapper.get('input[aria-label="タスクのタイトル"]').setValue('New task');
    await wrapper.get('[data-testid="create-task"]').trigger('submit');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="task"]').map((t) => t.get('button.link').text())).toEqual(
      ['Write spec', 'New task'],
    );
    expect(inputValue(wrapper.get('input[aria-label="タスクのタイトル"]'))).toBe('');

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

  it('creates a task with a description, then clears the form and selects it', async () => {
    let tasks = [makeTask()];
    const requests = stubApi({
      ...baseRoutes('admin', () => tasks),
      'POST /api/projects/p1/tasks': (body) => {
        const request = body as Pick<Task, 'title' | 'description'>;
        const created = makeTask({ id: 't2', ...request });
        tasks = [...tasks, created];
        return json(created, 201);
      },
      'GET /api/projects/p1/tasks/t2/comments': json([]),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    const form = wrapper.get('[data-testid="create-task"]');
    await form.get('input[aria-label="タスクのタイトル"]').setValue(' New task ');
    await typeInto(form, 'タスクの本文', 'Task body');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(localStorage.getItem('draft:project:p1:new-task')).not.toBeNull();

    await form.trigger('submit');
    await flushPromises();

    const posts = requests.mock.calls
      .map(([req]) => req)
      .filter((req) => req.method === 'POST')
      .map((req) => req.body);
    expect(posts).toEqual([
      { title: 'New task', description: plainTextToRichTextDoc('Task body') },
    ]);
    expect(inputValue(form.get('input[aria-label="タスクのタイトル"]'))).toBe('');
    expect(editorFor(form, 'タスクの本文').isEmpty).toBe(true);
    expect(localStorage.getItem('draft:project:p1:new-task')).toBeNull();
    expect(wrapper.get('[data-testid="task"].selected').get('button.link').text()).toBe('New task');
    const thread = wrapper.get('[data-testid="thread"]');
    expect(thread.get('h3').text()).toBe('New task');
    expect(thread.get('[data-testid="description"]').text()).toBe('Task body');
  });

  it('restores the new task description draft', async () => {
    localStorage.setItem(
      'draft:project:p1:new-task',
      JSON.stringify(plainTextToRichTextDoc('Saved draft')),
    );
    stubApi(baseRoutes('admin'));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);

    expect(editorFor(wrapper, 'タスクの本文').getText()).toBe('Saved draft');
  });

  it('shows a create error inside the form', async () => {
    stubApi({
      ...baseRoutes('admin'),
      'POST /api/projects/p1/tasks': json({ error: 'validation_error' }, 400),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    const form = wrapper.get('[data-testid="create-task"]');
    await form.get('input[aria-label="タスクのタイトル"]').setValue('x');
    await form.trigger('submit');
    await flushPromises();

    expect(form.get('[role="alert"]').text()).toBe('タイトルは1〜200文字で入力してください');
    expect(inputValue(form.get('input[aria-label="タスクのタイトル"]'))).toBe('x');
  });

  it('renames the selected task from the thread', async () => {
    let task = makeTask();
    const requests = stubApi({
      ...baseRoutes('admin', () => [task]),
      'PATCH /api/projects/p1/tasks/t1': (body) => {
        task = makeTask({ ...task, ...(body as Partial<Task>) });
        return json(task);
      },
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    await wrapper.get('[data-testid="task"] button.link').trigger('click');
    await flushPromises();
    const thread = wrapper.get('[data-testid="thread"]');
    await findButton(thread, 'タイトルを編集').trigger('click');
    await thread.get('input[aria-label="タイトル"]').setValue('Renamed');
    await thread.get('[data-testid="task-title-form"]').trigger('submit');
    await flushPromises();

    const patches = requests.mock.calls
      .map(([req]) => req)
      .filter((req) => req.method === 'PATCH')
      .map((req) => req.body);
    expect(patches).toEqual([{ title: 'Renamed' }]);
    expect(thread.get('h3').text()).toBe('Renamed');
    expect(wrapper.get('[data-testid="task"] button.link').text()).toBe('Renamed');
  });

  it('removes an archived task and closes its thread when it was selected', async () => {
    let tasks = [makeTask(), makeTask({ id: 't2', title: 'Second' })];
    stubApi({
      ...baseRoutes('admin', () => tasks),
      'POST /api/projects/p1/tasks/t1/archive': () => {
        tasks = tasks.filter((task) => task.id !== 't1');
        return json(makeTask({ archivedAt: '2026-09-10T00:00:00.000Z' }));
      },
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    await wrapper.get('[data-testid="task"] button.link').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="thread"]').text()).toContain('Looks good');

    await findButton(wrapper.get('[data-testid="task"]'), 'アーカイブ').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('[data-testid="task"]').map((t) => t.get('button.link').text())).toEqual(
      ['Second'],
    );
    expect(wrapper.get('[data-testid="thread"]').text()).toBe(
      'タスクを選択するとスレッドが表示されます',
    );
  });

  it('lists archived tasks on demand and restores them', async () => {
    const archived = makeTask({
      id: 't2',
      title: 'Old task',
      archivedAt: '2026-09-10T00:00:00.000Z',
    });
    let all = [makeTask(), archived];
    const requests = stubApi({
      ...baseRoutes('admin'),
      'GET /api/projects/p1/tasks?includeArchived=true': () => json(all),
      'POST /api/projects/p1/tasks/t2/unarchive': () => {
        const restored = makeTask({ ...archived, archivedAt: null });
        all = [all[0] ?? makeTask(), restored];
        return json(restored);
      },
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    expect(wrapper.findAll('[data-testid="task"]')).toHaveLength(1);

    await wrapper.get('input[aria-label="アーカイブ済みも表示"]').setValue(true);
    await flushPromises();

    const rendered = wrapper.findAll('[data-testid="task"]');
    expect(rendered.map((t) => t.get('button.link').text())).toEqual(['Write spec', 'Old task']);
    const archivedRow = rendered[1];
    if (!archivedRow) throw new Error('archived row missing');
    expect(archivedRow.classes()).toContain('archived');
    expect(rendered[0]?.classes()).not.toContain('archived');

    await findButton(archivedRow, '復元').trigger('click');
    await flushPromises();

    const restoredRow = wrapper.findAll('[data-testid="task"]')[1];
    expect(restoredRow?.classes()).not.toContain('archived');
    expect(restoredRow?.findAll('button').map((b) => b.text())).toContain('アーカイブ');
    const calls = requests.mock.calls.map(([req]) => `${req.method} ${req.path}`);
    expect(calls).toContain('GET /api/projects/p1/tasks?includeArchived=true');
    expect(calls).toContain('POST /api/projects/p1/tasks/t2/unarchive');
  });

  it('sends the date range and color from the task row', async () => {
    let task = makeTask();
    const requests = stubApi({
      ...baseRoutes('admin', () => [task]),
      'PATCH /api/projects/p1/tasks/t1': (body) => {
        task = makeTask({ ...task, ...(body as Partial<Task>) });
        return json(task);
      },
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);

    await wrapper.get('input[aria-label="開始日"]').setValue('2026-10-01');
    await flushPromises();
    expect(inputValue(wrapper.get('input[aria-label="終了日"]'))).toBe('2026-10-01');

    await wrapper.get('input[aria-label="終了日"]').setValue('');
    await flushPromises();

    await wrapper.get('select[aria-label="色"]').setValue('teal');
    await flushPromises();
    expect(inputValue(wrapper.get('select[aria-label="色"]'))).toBe('teal');

    const patches = requests.mock.calls
      .map(([req]) => req)
      .filter((req) => req.method === 'PATCH')
      .map((req) => req.body);
    expect(patches).toEqual([
      { startDate: '2026-10-01', endDate: '2026-10-01' },
      { startDate: null, endDate: null },
      { color: 'teal' },
    ]);
  });

  it('shows the date range and color as text for substaff', async () => {
    stubApi(
      baseRoutes('substaff', () => [
        makeTask({ startDate: '2026-10-01', endDate: '2026-10-03', color: 'teal' }),
      ]),
    );

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', bob);

    const task = wrapper.get('[data-testid="task"]');
    expect(task.find('input[type="date"]').exists()).toBe(false);
    expect(task.text()).toContain('期間: 2026-10-01 〜 2026-10-03');
    expect(task.text()).toContain('色: 青緑');
  });

  it('shows an action error for an invalid date range', async () => {
    stubApi({
      ...baseRoutes('admin'),
      'PATCH /api/projects/p1/tasks/t1': json({ error: 'invalid_date_range' }, 400),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    await wrapper.get('input[aria-label="開始日"]').setValue('2026-10-01');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('終了日は開始日以降にしてください');
  });

  it('opens a thread and posts a comment', async () => {
    let comments = [makeComment()];
    const requests = stubApi({
      ...baseRoutes('admin'),
      'GET /api/projects/p1/tasks/t1/comments': () => json(comments),
      'POST /api/projects/p1/tasks/t1/comments': () => {
        const posted = makeComment({
          id: 'c2',
          author: alice,
          body: plainTextToRichTextDoc('Thanks'),
        });
        comments = [...comments, posted];
        return json(posted, 201);
      },
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    await wrapper.get('[data-testid="task"] button.link').trigger('click');
    await flushPromises();

    await typeInto(wrapper, 'コメント', 'Thanks');
    await wrapper.get('[data-testid="create-comment"]').trigger('submit');
    await flushPromises();

    const rendered = wrapper.findAll('[data-testid="comment"]');
    expect(rendered.map((c) => c.text())).toEqual([
      expect.stringContaining('Bob'),
      expect.stringContaining('Alice'),
    ]);
    expect(editorFor(wrapper, 'コメント').isEmpty).toBe(true);
    const postCall = requests.mock.calls
      .map(([req]) => req)
      .find((req) => req.path.endsWith('/comments') && req.method === 'POST');
    expect(postCall?.body).toEqual({ body: plainTextToRichTextDoc('Thanks') });
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
        makeComment({ id: 'c-t2', taskId: 't2', body: plainTextToRichTextDoc('Second thread') }),
      ]),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    const [firstTask, secondTask] = wrapper.findAll('[data-testid="task"] button.link');
    await firstTask?.trigger('click');
    await flushPromises();
    await secondTask?.trigger('click');
    await flushPromises();
    resolveFirst(json([makeComment({ body: plainTextToRichTextDoc('First thread') })]));
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

  it('shows the task description and marks it as edited', async () => {
    stubApi(
      baseRoutes('substaff', () => [
        makeTask({
          description: plainTextToRichTextDoc('Spec body'),
          descriptionEditedAt: '2026-09-05T00:00:00.000Z',
        }),
      ]),
    );

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', bob);
    await wrapper.get('[data-testid="task"] button.link').trigger('click');
    await flushPromises();

    const thread = wrapper.get('[data-testid="thread"]');
    expect(thread.get('[data-testid="description"]').text()).toBe('Spec body');
    expect(thread.get('[data-testid="description-edited"]').text()).toBe('更新履歴あり');
    expect(thread.findAll('button').map((b) => b.text())).not.toContain('本文を編集');
  });

  it('hides an empty description and the edited mark for an untouched task', async () => {
    stubApi(baseRoutes('admin'));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    await wrapper.get('[data-testid="task"] button.link').trigger('click');
    await flushPromises();

    const thread = wrapper.get('[data-testid="thread"]');
    expect(thread.find('[data-testid="description"]').exists()).toBe(false);
    expect(thread.find('[data-testid="description-edited"]').exists()).toBe(false);
  });

  it('edits the task description with a PATCH of only the description', async () => {
    let task = makeTask({ description: plainTextToRichTextDoc('Old body') });
    const requests = stubApi({
      ...baseRoutes('admin', () => [task]),
      'PATCH /api/projects/p1/tasks/t1': (body) => {
        task = makeTask({
          ...task,
          ...(body as Partial<Task>),
          descriptionEditedAt: '2026-09-06T00:00:00.000Z',
        });
        return json(task);
      },
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1', alice);
    await wrapper.get('[data-testid="task"] button.link').trigger('click');
    await flushPromises();
    const thread = wrapper.get('[data-testid="thread"]');
    await findButton(thread, '本文を編集').trigger('click');
    await flushPromises();
    expect(editorFor(thread, '本文').getText()).toBe('Old body');

    await replaceContent(thread, '本文', 'New body');
    await thread.get('.task-description form').trigger('submit');
    await flushPromises();

    const patches = requests.mock.calls
      .map(([req]) => req)
      .filter((req) => req.method === 'PATCH')
      .map((req) => req.body);
    expect(patches).toEqual([{ description: plainTextToRichTextDoc('New body') }]);
    expect(thread.get('[data-testid="description"]').text()).toBe('New body');
    expect(thread.find('[data-testid="description-edited"]').exists()).toBe(true);
    expect(localStorage.getItem('draft:t1:description')).toBeNull();
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
