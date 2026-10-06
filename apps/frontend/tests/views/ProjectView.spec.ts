import { enableAutoUnmount, flushPromises, type DOMWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plainTextToRichTextDoc, type ProjectRole, type Task } from '@pm-tool/shared';
import { TASK_ARCHIVE_HELP } from '../../src/lib/help-texts';
import { taskDescriptionTemplate } from '../../src/lib/rich-text-templates';
import ProjectView from '../../src/views/ProjectView.vue';
import {
  alice,
  bob,
  json,
  makeLabel,
  makeMember,
  makeProject,
  makeTask,
  stubApi,
} from '../helpers/api-mock';
import { currentDialog, openDialog } from '../helpers/dialog';
import { inputValue, mountAt } from '../helpers/mount';
import { chooseOption, selectOptionLabels } from '../helpers/reka-select';
import { editorFor, replaceContent, typeInto } from '../helpers/rich-text';

const INCLUDE_ARCHIVED = '[role="checkbox"]#include-archived';
const BUG = makeLabel({ id: 'l1', name: 'バグ報告' });
const DOCS = makeLabel({ id: 'l2', name: 'ドキュメント', color: '#3e63dd' });

function baseRoutes(role: ProjectRole, tasks: () => Task[] = () => [makeTask({ assignee: bob })]) {
  return {
    'GET /api/projects/p1': json(makeProject({ role })),
    'GET /api/projects/p1/tasks': () => json(tasks()),
    'GET /api/projects/p1/members': json([makeMember(alice), makeMember(bob)]),
    'GET /api/projects/p1/labels': json([BUG, DOCS]),
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
      ['マニュアル', '/projects/p1/manuals'],
      ['ラベル', '/projects/p1/labels'],
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

    it('shows the state icon, label pill, author, period and assignee', async () => {
      stubApi(
        baseRoutes('substaff', () => [
          makeTask({
            label: makeLabel({ name: '更新依頼', color: '#3e63dd' }),
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
      const pill = row.get('[data-testid="task-label"]');
      expect(pill.text()).toBe('更新依頼');
      expect(pill.attributes('style')).toContain('border-color: #3e63dd66');
      expect(row.get('[data-testid="task-meta"]').text()).toBe(
        'Alice が 3 日前 に作成 · 2026-09-10 〜 2026-09-12',
      );
      expect(row.get('[data-testid="task-assignee"]').attributes('title')).toBe('Bob');
      expect(row.find('[role="checkbox"]').exists()).toBe(false);

      await wrapper.get('[data-testid="filter-done"]').trigger('click');

      const doneRow = wrapper.get('[data-testid="task"]');
      expect(doneRow.get('[role="img"]').attributes('aria-label')).toBe('完了');
      expect(doneRow.find('[data-testid="task-label"]').exists()).toBe(false);
      expect(doneRow.get('[data-testid="task-meta"]').text()).toBe('Alice が 3 日前 に作成');
      expect(doneRow.find('[data-testid="task-assignee"]').exists()).toBe(false);
    });

    it('colors the period of an open task that is overdue or due soon', async () => {
      stubApi(
        baseRoutes('substaff', () => [
          makeTask({ id: 't1', endDate: '2026-09-03' }),
          makeTask({ id: 't2', startDate: '2026-09-01', endDate: '2026-09-06' }),
          makeTask({ id: 't3', endDate: '2026-09-07' }),
        ]),
      );

      const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', bob);

      const periods = wrapper.findAll('[data-testid="task-period"]');
      expect(periods.map((p) => p.text())).toEqual([
        '〜 2026-09-03',
        '2026-09-01 〜 2026-09-06',
        '〜 2026-09-07',
      ]);
      expect(periods[0]?.classes()).toContain('text-destructive');
      expect(periods[1]?.classes()).toContain('text-warning');
      expect(periods[2]?.classes()).not.toContain('text-warning');
      expect(periods[2]?.classes()).not.toContain('text-destructive');
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
      { title: 'New task', description: taskDescriptionTemplate() },
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
    await replaceContent(form, 'タスクの本文', 'Task body');
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
    expect(editorFor(reopened, 'タスクの本文').getJSON()).toEqual(taskDescriptionTemplate());
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
    await replaceContent(dialog, 'タスクの本文', 'Unsent body');
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
    expect(document.body.textContent).not.toContain(TASK_ARCHIVE_HELP);
    await wrapper.get(INCLUDE_ARCHIVED).trigger('focusin');
    await flushPromises();
    expect(document.body.textContent).toContain(TASK_ARCHIVE_HELP);

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
      'GET /api/projects/p1/members': json({ error: 'not_found' }, 404),
      'GET /api/projects/p1/labels': json({ error: 'not_found' }, 404),
    });

    const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', bob);

    expect(wrapper.get('[data-testid="project-not-found"]').text()).toContain(
      'プロジェクトが見つかりません',
    );
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="task"]').exists()).toBe(false);
  });

  describe('filters and sorting', () => {
    const filterTasks = () => [
      makeTask({ id: 't1', title: 'Bob bug', assignee: bob, label: BUG, endDate: '2026-09-20' }),
      makeTask({ id: 't2', title: 'Alice docs', assignee: alice, label: DOCS }),
      makeTask({ id: 't3', title: 'Nobody', endDate: '2026-09-02' }),
      makeTask({ id: 't4', title: 'Bob done', assignee: bob, status: 'done' }),
    ];

    function titles(wrapper: Pick<DOMWrapper<Element>, 'findAll'>) {
      return wrapper.findAll('[data-testid="task"] [data-testid="task-open"]').map((l) => l.text());
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-04T00:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('offers members and labels as filter options', async () => {
      stubApi(baseRoutes('substaff', filterTasks));

      const { wrapper } = await mountAt(ProjectView, '/projects/p1/tasks', bob);

      expect(await selectOptionLabels(wrapper.get('[aria-label="担当者で絞り込む"]'))).toEqual([
        'すべて',
        '未割り当て',
        'Alice',
        'Bob',
      ]);
      expect(await selectOptionLabels(wrapper.get('[aria-label="ラベルで絞り込む"]'))).toEqual([
        'すべて',
        'ラベルなし',
        'バグ報告',
        'ドキュメント',
      ]);
      expect(await selectOptionLabels(wrapper.get('[aria-label="期間で絞り込む"]'))).toEqual([
        'すべて',
        '期限超過',
        '今週',
        '日付未設定',
      ]);
      expect(await selectOptionLabels(wrapper.get('[aria-label="並べ替え"]'))).toEqual([
        '作成日時',
        '終了日が近い順',
        '更新日時が新しい順',
      ]);
      expect(wrapper.find('[data-testid="clear-filters"]').exists()).toBe(false);
    });

    it('filters by assignee, keeps the URL in sync and counts only matching tasks', async () => {
      stubApi(baseRoutes('substaff', filterTasks));

      const { wrapper, router } = await mountAt(ProjectView, '/projects/p1/tasks', bob);
      const push = vi.spyOn(router, 'push');
      const replace = vi.spyOn(router, 'replace');
      expect(titles(wrapper)).toEqual(['Bob bug', 'Alice docs', 'Nobody']);

      await chooseOption(wrapper.get('[aria-label="担当者で絞り込む"]'), 'Bob');
      await flushPromises();

      expect(router.currentRoute.value.query).toEqual({ assignee: bob.id });
      expect(replace).toHaveBeenCalledTimes(1);
      expect(push).not.toHaveBeenCalled();
      expect(titles(wrapper)).toEqual(['Bob bug']);
      expect(wrapper.get('[data-testid="filter-open"]').text()).toBe('未完了 1');
      expect(wrapper.get('[data-testid="filter-done"]').text()).toBe('完了 1');

      await wrapper.get('[data-testid="filter-done"]').trigger('click');
      expect(titles(wrapper)).toEqual(['Bob done']);

      await chooseOption(wrapper.get('[aria-label="担当者で絞り込む"]'), '未割り当て');
      await flushPromises();
      expect(router.currentRoute.value.query).toEqual({ assignee: 'none' });
      expect(titles(wrapper)).toEqual([]);
      expect(wrapper.text()).toContain('条件に一致するタスクはありません');
    });

    it('restores filters and sort from the URL and clears the filters only', async () => {
      stubApi(baseRoutes('substaff', filterTasks));

      const { wrapper, router } = await mountAt(
        ProjectView,
        '/projects/p1/tasks?label=none&due=overdue&sort=end',
        bob,
      );

      expect(titles(wrapper)).toEqual(['Nobody']);
      expect(wrapper.get('[data-testid="filter-open"]').text()).toBe('未完了 1');
      expect(wrapper.get('[aria-label="ラベルで絞り込む"]').text()).toContain('ラベルなし');
      expect(wrapper.get('[aria-label="期間で絞り込む"]').text()).toContain('期限超過');
      expect(wrapper.get('[aria-label="並べ替え"]').text()).toContain('終了日が近い順');

      await wrapper.get('[data-testid="clear-filters"]').trigger('click');
      await flushPromises();

      expect(router.currentRoute.value.query).toEqual({ sort: 'end' });
      expect(titles(wrapper)).toEqual(['Nobody', 'Bob bug', 'Alice docs']);
      expect(wrapper.find('[data-testid="clear-filters"]').exists()).toBe(false);
    });

    it('filters by label', async () => {
      stubApi(baseRoutes('substaff', filterTasks));

      const { wrapper, router } = await mountAt(ProjectView, '/projects/p1/tasks', bob);
      await chooseOption(wrapper.get('[aria-label="ラベルで絞り込む"]'), 'ドキュメント');
      await flushPromises();

      expect(router.currentRoute.value.query).toEqual({ label: 'l2' });
      expect(titles(wrapper)).toEqual(['Alice docs']);
    });

    it('sorts by end date and by last update', async () => {
      stubApi(
        baseRoutes('substaff', () => [
          makeTask({ id: 't1', title: 'Old', updatedAt: '2026-09-02T00:00:00.000Z' }),
          makeTask({
            id: 't2',
            title: 'Late',
            endDate: '2026-09-30',
            updatedAt: '2026-09-01T00:00:00.000Z',
          }),
          makeTask({
            id: 't3',
            title: 'Soon',
            endDate: '2026-09-10',
            updatedAt: '2026-09-03T00:00:00.000Z',
          }),
        ]),
      );

      const { wrapper, router } = await mountAt(ProjectView, '/projects/p1/tasks', bob);
      expect(titles(wrapper)).toEqual(['Old', 'Late', 'Soon']);

      await chooseOption(wrapper.get('[aria-label="並べ替え"]'), '終了日が近い順');
      await flushPromises();
      expect(router.currentRoute.value.query).toEqual({ sort: 'end' });
      expect(titles(wrapper)).toEqual(['Soon', 'Late', 'Old']);

      await chooseOption(wrapper.get('[aria-label="並べ替え"]'), '更新日時が新しい順');
      await flushPromises();
      expect(titles(wrapper)).toEqual(['Soon', 'Old', 'Late']);

      await chooseOption(wrapper.get('[aria-label="並べ替え"]'), '作成日時');
      await flushPromises();
      expect(router.currentRoute.value.query).toEqual({});
      expect(titles(wrapper)).toEqual(['Old', 'Late', 'Soon']);
    });
  });
});
