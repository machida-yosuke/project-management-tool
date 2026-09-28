import { enableAutoUnmount, flushPromises, type DOMWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plainTextToRichTextDoc, type ProjectRole, type Task } from '@pm-tool/shared';
import ProjectView from '../../src/views/ProjectView.vue';
import { alice, bob, json, makeProject, makeTask, stubApi } from '../helpers/api-mock';
import { currentDialog, openDialog } from '../helpers/dialog';
import { inputValue, mountAt } from '../helpers/mount';
import { editorFor, typeInto } from '../helpers/rich-text';

const INCLUDE_ARCHIVED = '[role="checkbox"]#include-archived';

function baseRoutes(role: ProjectRole, tasks: () => Task[] = () => [makeTask({ assignee: bob })]) {
  return {
    'GET /api/projects/p1': json(makeProject({ role })),
    'GET /api/projects/p1/tasks': () => json(tasks()),
  };
}

function findButton(scope: Pick<DOMWrapper<Element>, 'findAll'>, text: string) {
  const button = scope.findAll('button').find((b) => b.text() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

describe('ProjectView', () => {
  enableAutoUnmount(afterEach);

  beforeEach(() => {
    localStorage.clear();
  });

  it('shows only the tabs of the project header with the tasks tab as current', async () => {
    stubApi(baseRoutes('substaff'));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', bob);

    const nav = wrapper.get('nav[aria-label="プロジェクト"]');
    expect(nav.findAll('a').map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['ホーム', '/projects/p1'],
      ['タスク', '/projects/p1/tasks'],
      ['カレンダー', '/projects/p1/calendar'],
      ['メンバー', '/projects/p1/members'],
    ]);
    expect(nav.get('a[aria-current="page"]').text()).toBe('タスク');
    expect(wrapper.find('h1').exists()).toBe(false);
  });

  it('shows an empty state when there are no tasks', async () => {
    stubApi(baseRoutes('staff', () => []));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', bob);

    expect(wrapper.find('[data-testid="task"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('未完了のタスクはありません');
  });

  it('filters tasks by status and shows the count of each', async () => {
    stubApi(
      baseRoutes('substaff', () => [
        makeTask(),
        makeTask({ id: 't2', title: 'Shipped', status: 'done' }),
        makeTask({ id: 't3', title: 'Review', status: 'open' }),
      ]),
    );

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', bob);
    const openFilter = wrapper.get('[data-testid="filter-open"]');
    const doneFilter = wrapper.get('[data-testid="filter-done"]');
    const titles = () =>
      wrapper.findAll('[data-testid="task"] [data-testid="task-open"]').map((l) => l.text());

    expect(openFilter.text()).toBe('未完了 2');
    expect(doneFilter.text()).toBe('完了 1');
    expect(openFilter.attributes('aria-pressed')).toBe('true');
    expect(doneFilter.attributes('aria-pressed')).toBe('false');
    expect(titles()).toEqual(['Write spec', 'Review']);

    await doneFilter.trigger('click');

    expect(openFilter.attributes('aria-pressed')).toBe('false');
    expect(doneFilter.attributes('aria-pressed')).toBe('true');
    expect(titles()).toEqual(['Shipped']);
    expect(wrapper.get('[data-testid="task"]').classes()).toContain('done');

    await openFilter.trigger('click');
    expect(titles()).toEqual(['Write spec', 'Review']);
  });

  it('shows an empty state for the done filter when nothing is done', async () => {
    stubApi(baseRoutes('staff', () => [makeTask()]));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', bob);
    await wrapper.get('[data-testid="filter-done"]').trigger('click');

    expect(wrapper.find('[data-testid="task"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('完了したタスクはありません');
  });

  describe('row details', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-04T00:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows the state icon, color pill, author, period and assignee', async () => {
      stubApi(
        baseRoutes('substaff', () => [
          makeTask({
            color: 'blue',
            assignee: bob,
            startDate: '2026-09-10',
            endDate: '2026-09-12',
          }),
          makeTask({ id: 't2', title: 'Shipped', status: 'done' }),
        ]),
      );

      const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', bob);

      const row = wrapper.get('[data-testid="task"]');
      expect(row.get('[role="img"]').attributes('aria-label')).toBe('未完了');
      const pill = row.get('[data-testid="task-color"]');
      expect(pill.text()).toBe('青');
      expect(pill.attributes('style')).toContain('border-color: #3e63dd66');
      expect(row.get('[data-testid="task-meta"]').text()).toBe(
        'Alice が 3 日前 に作成 · 2026-09-10 〜 2026-09-12',
      );
      expect(row.get('[data-testid="task-assignee"]').attributes('title')).toBe('Bob');
      expect(row.find('[role="checkbox"]').exists()).toBe(false);

      await wrapper.get('[data-testid="filter-done"]').trigger('click');

      const doneRow = wrapper.get('[data-testid="task"]');
      expect(doneRow.get('[role="img"]').attributes('aria-label')).toBe('完了');
      expect(doneRow.get('[data-testid="task-color"]').text()).toBe('灰');
      expect(doneRow.get('[data-testid="task-meta"]').text()).toBe('Alice が 3 日前 に作成');
      expect(doneRow.find('[data-testid="task-assignee"]').exists()).toBe(false);
    });
  });

  it('shows edit controls for staff', async () => {
    stubApi(baseRoutes('staff'));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', bob);

    expect(wrapper.find('[data-testid="create-task"]').exists()).toBe(false);
    const dialog = await openDialog(wrapper, 'タスクを作成');
    expect(dialog.text()).toContain('タスクを作成');
    expect(dialog.find('[data-testid="create-task"]').exists()).toBe(true);
  });

  it('links each task title to its detail page', async () => {
    stubApi(baseRoutes('substaff', () => [makeTask(), makeTask({ id: 't2', title: 'Second' })]));

    const { wrapper, router } = await mountAt(ProjectView, '/projects/p1/tasks', bob);

    const links = wrapper.findAll('[data-testid="task"] [data-testid="task-open"]');
    expect(
      links.map((link) => [link.element.tagName, link.text(), link.attributes('href')]),
    ).toEqual([
      ['A', 'Write spec', '/projects/p1/tasks/t1'],
      ['A', 'Second', '/projects/p1/tasks/t2'],
    ]);
    expect(wrapper.find('[data-testid="thread"]').exists()).toBe(false);

    await links[1]?.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('task');
    expect(router.currentRoute.value.params).toEqual({ projectId: 'p1', taskId: 't2' });
  });

  it('hides every edit control for substaff', async () => {
    stubApi(baseRoutes('substaff'));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', bob);

    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('タスクを作成');
    expect(wrapper.find('[data-testid="create-task"]').exists()).toBe(false);
    const task = wrapper.get('[data-testid="task"]');
    expect(task.find('[role="checkbox"]').exists()).toBe(false);
  });

  it('adds a task', async () => {
    let tasks = [makeTask({ assignee: bob })];
    const requests = stubApi({
      ...baseRoutes('admin', () => tasks),
      'POST /api/projects/p1/tasks': () => {
        const created = makeTask({ id: 't2', title: 'New task' });
        tasks = [...tasks, created];
        return json(created, 201);
      },
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', alice);

    const dialog = await openDialog(wrapper, 'タスクを作成');
    await dialog.get('input[aria-label="タスクのタイトル"]').setValue('New task');
    await dialog.get('[data-testid="create-task"]').trigger('submit');
    await flushPromises();
    expect(currentDialog()).toBeNull();
    expect(
      wrapper.findAll('[data-testid="task"]').map((t) => t.get('[data-testid="task-open"]').text()),
    ).toEqual(['Write spec', 'New task']);
    const reopened = await openDialog(wrapper, 'タスクを作成');
    expect(inputValue(reopened.get('input[aria-label="タスクのタイトル"]'))).toBe('');
    await findButton(reopened, '閉じる').trigger('click');
    await flushPromises();

    const calls = requests.mock.calls.map(([req]) => req);
    expect(calls.filter((req) => req.method === 'POST').map((req) => req.body)).toEqual([
      { title: 'New task' },
    ]);
    expect(calls.filter((req) => req.method === 'PATCH')).toEqual([]);
  });

  it('creates a task with a description, then clears the form and lists it', async () => {
    let tasks = [makeTask()];
    const requests = stubApi({
      ...baseRoutes('admin', () => tasks),
      'POST /api/projects/p1/tasks': (body) => {
        const request = body as Pick<Task, 'title' | 'description'>;
        const created = makeTask({ id: 't2', ...request });
        tasks = [...tasks, created];
        return json(created, 201);
      },
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', alice);
    const form = (await openDialog(wrapper, 'タスクを作成')).get('[data-testid="create-task"]');
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
    expect(currentDialog()).toBeNull();
    expect(localStorage.getItem('draft:project:p1:new-task')).toBeNull();
    const reopened = await openDialog(wrapper, 'タスクを作成');
    expect(inputValue(reopened.get('input[aria-label="タスクのタイトル"]'))).toBe('');
    expect(editorFor(reopened, 'タスクの本文').isEmpty).toBe(true);
    expect(
      wrapper.findAll('[data-testid="task"]').map((t) => t.get('[data-testid="task-open"]').text()),
    ).toEqual(['Write spec', 'New task']);
  });

  it('restores the new task description draft', async () => {
    localStorage.setItem(
      'draft:project:p1:new-task',
      JSON.stringify(plainTextToRichTextDoc('Saved draft')),
    );
    stubApi(baseRoutes('admin'));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', alice);
    const dialog = await openDialog(wrapper, 'タスクを作成');

    expect(editorFor(dialog, 'タスクの本文').getText()).toBe('Saved draft');
  });

  it('shows a create error inside the dialog and keeps it open', async () => {
    stubApi({
      ...baseRoutes('admin'),
      'POST /api/projects/p1/tasks': json({ error: 'validation_error' }, 400),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', alice);
    const form = (await openDialog(wrapper, 'タスクを作成')).get('[data-testid="create-task"]');
    await form.get('input[aria-label="タスクのタイトル"]').setValue('x');
    await form.trigger('submit');
    await flushPromises();

    expect(currentDialog()).not.toBeNull();
    expect(form.get('[role="alert"]').text()).toBe('タイトルは1〜200文字で入力してください');
    expect(inputValue(form.get('input[aria-label="タスクのタイトル"]'))).toBe('x');
  });

  it('keeps the title and description draft after closing the dialog', async () => {
    stubApi(baseRoutes('admin'));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', alice);
    const dialog = await openDialog(wrapper, 'タスクを作成');
    await dialog.get('input[aria-label="タスクのタイトル"]').setValue('Half done');
    await typeInto(dialog, 'タスクの本文', 'Unsent body');
    await findButton(dialog, '閉じる').trigger('click');
    await flushPromises();
    expect(currentDialog()).toBeNull();

    const reopened = await openDialog(wrapper, 'タスクを作成');
    expect(inputValue(reopened.get('input[aria-label="タスクのタイトル"]'))).toBe('Half done');
    expect(editorFor(reopened, 'タスクの本文').getText()).toBe('Unsent body');
  });

  it('opens the link dialog on top of the create dialog', async () => {
    stubApi(baseRoutes('admin'));

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', alice);
    const createDialog = await openDialog(wrapper, 'タスクを作成');
    await typeInto(createDialog, 'タスクの本文', 'docs');
    editorFor(createDialog, 'タスクの本文').commands.selectAll();
    await createDialog.get('button[aria-label="リンク"]').trigger('click');
    await flushPromises();

    const linkDialog = currentDialog();
    if (!linkDialog) throw new Error('Link dialog did not open');
    expect(linkDialog.text()).toContain('リンクを挿入');
    await linkDialog.get('input[aria-label="リンク先の URL"]').setValue('https://example.com');
    await linkDialog.get('[data-testid="link-form"]').trigger('submit');
    await flushPromises();

    expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(currentDialog()?.text()).toContain('タスクを作成');
    expect(createDialog.get('[role="textbox"] a').attributes('href')).toBe('https://example.com');
  });

  it('lists archived tasks on demand', async () => {
    const archived = makeTask({
      id: 't2',
      title: 'Old task',
      archivedAt: '2026-09-10T00:00:00.000Z',
    });
    const requests = stubApi({
      ...baseRoutes('admin'),
      'GET /api/projects/p1/tasks?includeArchived=true': json([makeTask(), archived]),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', alice);
    expect(wrapper.findAll('[data-testid="task"]')).toHaveLength(1);

    await wrapper.get(INCLUDE_ARCHIVED).trigger('click');
    await flushPromises();

    const rendered = wrapper.findAll('[data-testid="task"]');
    expect(rendered.map((t) => t.get('[data-testid="task-open"]').text())).toEqual([
      'Write spec',
      'Old task',
    ]);
    const archivedRow = rendered[1];
    if (!archivedRow) throw new Error('archived row missing');
    expect(archivedRow.classes()).toContain('archived');
    expect(archivedRow.get('[data-testid="task-meta"]').text()).toMatch(/ · アーカイブ済み$/);
    expect(rendered[0]?.classes()).not.toContain('archived');
    const calls = requests.mock.calls.map(([req]) => `${req.method} ${req.path}`);
    expect(calls).toContain('GET /api/projects/p1/tasks?includeArchived=true');
  });

  it('shows not found for projects the user is not a member of', async () => {
    stubApi({
      'GET /api/projects/p1': json({ error: 'not_found' }, 404),
      'GET /api/projects/p1/tasks': json({ error: 'not_found' }, 404),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', bob);

    expect(wrapper.get('[role="alert"]').text()).toBe('プロジェクトが見つかりません');
    expect(wrapper.find('[data-testid="task"]').exists()).toBe(false);
  });
});
