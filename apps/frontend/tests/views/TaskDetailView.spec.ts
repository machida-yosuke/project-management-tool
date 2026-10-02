import { enableAutoUnmount, flushPromises, type DOMWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  plainTextToRichTextDoc,
  type ProjectRole,
  type Task,
  type TaskComment,
  type TaskLabel,
} from '@pm-tool/shared';
import { TASK_ARCHIVE_HELP, TASK_DONE_HELP } from '../../src/lib/help-texts';
import TaskDetailView from '../../src/views/TaskDetailView.vue';
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
import { currentDialog } from '../helpers/dialog';
import { inputValue, mountAt } from '../helpers/mount';
import { chooseOption, selectOptionLabels } from '../helpers/reka-select';
import { editorFor, replaceContent, typeInto } from '../helpers/rich-text';

const PATH = '/projects/p1/tasks/t1';
const TASKS = 'GET /api/projects/p1/tasks?includeArchived=true';
const ASSIGNEE_SELECT = '[role="combobox"][aria-label="担当者"]';
const LABEL_SELECT = '[role="combobox"][aria-label="ラベル"]';
const LABELS = 'GET /api/projects/p1/labels';

const bugLabel = makeLabel({ id: 'l1', name: 'バグ報告', color: '#e5484d' });
const requestLabel = makeLabel({ id: 'l2', name: '更新依頼', color: '#3e63dd' });

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

function baseRoutes(
  role: ProjectRole,
  tasks: () => Task[] = () => [makeTask({ assignee: bob })],
  labels: () => TaskLabel[] = () => [bugLabel, requestLabel],
) {
  return {
    'GET /api/projects/p1': json(makeProject({ role })),
    [LABELS]: () => json(labels()),
    [TASKS]: () => json(tasks()),
    'GET /api/projects/p1/members': json([
      makeMember(alice, { role: 'admin', isOwner: true }),
      makeMember(bob, { role }),
    ]),
    'GET /api/projects/p1/tasks/t1/comments': json([makeComment()]),
  };
}

// Mirrors the server so each PATCH shows up in the refetched list.
function patchingRoutes(
  role: ProjectRole,
  initial: Task,
  labels: () => TaskLabel[] = () => [bugLabel, requestLabel],
) {
  let task = initial;
  return {
    ...baseRoutes(role, () => [task], labels),
    'PATCH /api/projects/p1/tasks/t1': (body: unknown) => {
      const { assigneeId, labelId, ...patch } = body as Partial<Task> & {
        assigneeId?: string | null;
        labelId?: string | null;
      };
      task = makeTask({
        ...task,
        ...patch,
        ...(assigneeId !== undefined ? { assignee: assigneeId === bob.id ? bob : null } : {}),
        ...(labelId !== undefined
          ? { label: labels().find((label) => label.id === labelId) ?? null }
          : {}),
      });
      return json(task);
    },
  };
}

function findButton(scope: Pick<DOMWrapper<Element>, 'findAll'>, text: string) {
  const button = scope.findAll('button').find((b) => b.text() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

// Select triggers are buttons too; only the action buttons matter here.
function buttonLabels(scope: Pick<DOMWrapper<Element>, 'findAll'>) {
  return scope
    .findAll('button:not([role="combobox"])')
    .map((b) => b.text())
    .filter((text) => text !== '');
}

function patchBodies(requests: ReturnType<typeof stubApi>) {
  return requests.mock.calls
    .map(([req]) => req)
    .filter((req) => req.method === 'PATCH')
    .map((req) => req.body);
}

function requestLines(requests: ReturnType<typeof stubApi>) {
  return requests.mock.calls.map(([req]) => `${req.method} ${req.path}`);
}

describe('TaskDetailView', () => {
  enableAutoUnmount(afterEach);

  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the task under the tasks tab with a link back to the list', async () => {
    const requests = stubApi(baseRoutes('staff'));

    const { wrapper } = await mountAt(TaskDetailView, PATH, bob);

    expect(wrapper.find('h1').exists()).toBe(false);
    expect(wrapper.get('nav a[aria-current="page"]').text()).toBe('タスク');
    const back = wrapper.get('[data-testid="back-to-tasks"]');
    expect(back.text()).toBe('← タスク一覧');
    expect(back.attributes('href')).toBe('/projects/p1/tasks');
    const header = wrapper.get('[data-testid="task-header"]');
    expect(header.get('h2').text()).toBe('Write spec');
    expect(header.get('[data-testid="task-status"]').text()).toBe('未完了');
    expect(header.text()).toContain('Alice が');
    expect(header.text()).toContain('コメント 1 件');
    expect(wrapper.get('[data-testid="task-created-by"]').text()).toBe('Alice');
    expect(wrapper.findAll('[data-testid="comment"]').map((c) => c.text())).toEqual([
      expect.stringContaining('Looks good'),
    ]);
    expect(requestLines(requests)).toContain(TASKS);
    expect(requestLines(requests)).not.toContain('GET /api/projects/p1/tasks');
  });

  it('shows edit controls for staff', async () => {
    stubApi(baseRoutes('staff', () => [makeTask({ assignee: bob, label: bugLabel })]));

    const { wrapper } = await mountAt(TaskDetailView, PATH, bob);

    const sidebar = wrapper.get('[data-testid="task-sidebar"]');
    const select = sidebar.get(ASSIGNEE_SELECT);
    expect(select.text()).toBe('Bob');
    expect(await selectOptionLabels(select)).toEqual(['未割り当て', 'Alice', 'Bob']);
    const labelSelect = sidebar.get(LABEL_SELECT);
    expect(labelSelect.text()).toBe('バグ報告');
    expect(await selectOptionLabels(labelSelect)).toEqual([
      'なし',
      'バグ報告',
      '更新依頼',
      '新しいラベルを作成…',
    ]);
    expect(sidebar.findAll('input[type="date"]')).toHaveLength(2);
    expect(buttonLabels(sidebar)).toEqual(['アーカイブ']);
    expect(buttonLabels(wrapper.get('[data-testid="task-header"]'))).toEqual(['タイトルを編集']);
    const timeline = wrapper.get('[data-testid="task-timeline"]');
    expect(buttonLabels(timeline)).toEqual(
      expect.arrayContaining(['本文を編集', '編集', '完了にする', 'コメント']),
    );
    expect(wrapper.find('[data-testid="create-comment"]').exists()).toBe(true);
  });

  it('explains done and archive in tooltips on the buttons', async () => {
    stubApi(baseRoutes('staff'));
    const { wrapper } = await mountAt(TaskDetailView, PATH, bob);

    expect(document.body.textContent).not.toContain(TASK_DONE_HELP);
    const done = findButton(wrapper.get('[data-testid="task-timeline"]'), '完了にする');
    await done.trigger('focus');
    await flushPromises();
    expect(document.body.textContent).toContain(TASK_DONE_HELP);
    await done.trigger('blur');

    await findButton(wrapper.get('[data-testid="task-sidebar"]'), 'アーカイブ').trigger('focus');
    await flushPromises();
    expect(document.body.textContent).toContain(TASK_ARCHIVE_HELP);
  });

  it('shows every field as text for substaff', async () => {
    const requests = stubApi(
      baseRoutes('substaff', () => [
        makeTask({
          assignee: bob,
          startDate: '2026-10-01',
          endDate: '2026-10-03',
          label: requestLabel,
        }),
      ]),
    );

    const { wrapper } = await mountAt(TaskDetailView, PATH, bob);

    expect(wrapper.find('[role="combobox"]').exists()).toBe(false);
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('完了にする');
    expect(wrapper.find('input[type="date"]').exists()).toBe(false);
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('アーカイブ');
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('タイトルを編集');
    expect(wrapper.get('[data-testid="task-status"]').text()).toBe('未完了');
    expect(wrapper.get('[data-testid="task-assignee"]').text()).toBe('Bob');
    expect(wrapper.get('[data-testid="task-start-date"]').text()).toBe('2026-10-01');
    expect(wrapper.get('[data-testid="task-end-date"]').text()).toBe('2026-10-03');
    expect(wrapper.get('[data-testid="task-label"]').text()).toBe('更新依頼');
    expect(requestLines(requests)).not.toContain(LABELS);
    expect(wrapper.find('[data-testid="create-comment"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Looks good');
  });

  it('colors an overdue end date for an open task only', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0));
    try {
      stubApi(baseRoutes('substaff', () => [makeTask({ endDate: '2026-10-03' })]));
      const { wrapper } = await mountAt(TaskDetailView, PATH, bob);
      const endDate = wrapper.get('[data-testid="task-end-date"]');
      expect(endDate.text()).toBe('2026-10-03');
      expect(endDate.classes()).toContain('text-destructive');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows unset dates and an unassigned task as text for substaff', async () => {
    stubApi(baseRoutes('substaff', () => [makeTask()]));

    const { wrapper } = await mountAt(TaskDetailView, PATH, bob);

    expect(wrapper.get('[data-testid="task-assignee"]').text()).toBe('未割り当て');
    expect(wrapper.get('[data-testid="task-start-date"]').text()).toBe('未設定');
    expect(wrapper.get('[data-testid="task-end-date"]').text()).toBe('未設定');
    expect(wrapper.get('[data-testid="task-label"]').text()).toBe('なし');
  });

  it('toggles completion and changes the assignee', async () => {
    const requests = stubApi(patchingRoutes('admin', makeTask({ assignee: bob })));

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);
    await findButton(wrapper, '完了にする').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="task-status"]').text()).toBe('完了');
    expect(buttonLabels(wrapper)).not.toContain('完了にする');
    expect(buttonLabels(wrapper)).toContain('未完了に戻す');

    await chooseOption(wrapper.get(ASSIGNEE_SELECT), '未割り当て');
    expect(wrapper.get(ASSIGNEE_SELECT).text()).toBe('未割り当て');

    expect(patchBodies(requests)).toEqual([{ status: 'done' }, { assigneeId: null }]);
  });

  it('sends the date range and label', async () => {
    const requests = stubApi(patchingRoutes('admin', makeTask()));

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);

    await wrapper.get('input[aria-label="開始日"]').setValue('2026-10-01');
    await flushPromises();
    expect(inputValue(wrapper.get('input[aria-label="終了日"]'))).toBe('2026-10-01');

    await wrapper.get('input[aria-label="終了日"]').setValue('');
    await flushPromises();

    await chooseOption(wrapper.get(LABEL_SELECT), '更新依頼');
    expect(wrapper.get(LABEL_SELECT).text()).toBe('更新依頼');

    await chooseOption(wrapper.get(LABEL_SELECT), 'なし');
    expect(wrapper.get(LABEL_SELECT).text()).toBe('なし');

    expect(patchBodies(requests)).toEqual([
      { startDate: '2026-10-01', endDate: '2026-10-01' },
      { startDate: null, endDate: null },
      { labelId: 'l2' },
      { labelId: null },
    ]);
  });

  it('creates a label from the select and attaches it to the task', async () => {
    let labels = [bugLabel, requestLabel];
    const created = makeLabel({ id: 'l3', name: '要確認', color: '#8e4ec6' });
    const requests = stubApi({
      ...patchingRoutes('admin', makeTask(), () => labels),
      'POST /api/projects/p1/labels': () => {
        labels = [...labels, created];
        return json(created, 201);
      },
    });

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);
    await chooseOption(wrapper.get(LABEL_SELECT), '新しいラベルを作成…');
    const dialog = currentDialog();
    if (!dialog) throw new Error('Label dialog did not open');
    expect(dialog.get('h2').text()).toBe('ラベルを作成');
    expect(patchBodies(requests)).toEqual([]);

    await dialog.get('input[aria-label="ラベルの名前"]').setValue('  要確認 ');
    await dialog.get('button[aria-label="#8e4ec6"]').trigger('click');
    await dialog.get('[data-testid="label-form"]').trigger('submit');
    await flushPromises();

    const post = requests.mock.calls.map(([req]) => req).find((req) => req.method === 'POST');
    expect(post?.body).toEqual({ name: '要確認', color: '#8e4ec6' });
    expect(patchBodies(requests)).toEqual([{ labelId: 'l3' }]);
    expect(currentDialog()).toBeNull();
    expect(wrapper.get(LABEL_SELECT).text()).toBe('要確認');
    expect(requestLines(requests).filter((line) => line === LABELS)).toHaveLength(2);
  });

  it.each([
    [json({ error: 'label_name_taken' }, 409), '同じ名前のラベルがあります'],
    [json({ error: 'validation_error', issues: [] }, 400), '名前は1〜50文字で入力してください'],
  ])('keeps the label dialog open with an error', async (response, message) => {
    const requests = stubApi({
      ...patchingRoutes('admin', makeTask()),
      'POST /api/projects/p1/labels': response,
    });

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);
    await chooseOption(wrapper.get(LABEL_SELECT), '新しいラベルを作成…');
    const dialog = currentDialog();
    if (!dialog) throw new Error('Label dialog did not open');
    await dialog.get('input[aria-label="ラベルの名前"]').setValue('バグ報告');
    await dialog.get('[data-testid="label-form"]').trigger('submit');
    await flushPromises();

    expect(currentDialog()).not.toBeNull();
    expect(dialog.get('[role="alert"]').text()).toBe(message);
    expect(inputValue(dialog.get('input[aria-label="ラベルの名前"]'))).toBe('バグ報告');
    expect(patchBodies(requests)).toEqual([]);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('shows an action error for an invalid date range', async () => {
    stubApi({
      ...baseRoutes('admin'),
      'PATCH /api/projects/p1/tasks/t1': json({ error: 'invalid_date_range' }, 400),
    });

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);
    await wrapper.get('input[aria-label="開始日"]').setValue('2026-10-01');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('終了日は開始日以降にしてください');
  });

  it('shows an action error when the assignee is not a member', async () => {
    stubApi({
      ...baseRoutes('admin'),
      'PATCH /api/projects/p1/tasks/t1': json({ error: 'assignee_not_member' }, 400),
    });

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);
    await chooseOption(wrapper.get(ASSIGNEE_SELECT), 'Alice');

    expect(wrapper.get('[role="alert"]').text()).toBe(
      '担当者はプロジェクトメンバーから選んでください',
    );
  });

  it('shows the new assignee and label while the PATCH is pending', async () => {
    const routes = patchingRoutes('admin', makeTask({ assignee: bob }));
    const pending: (() => void)[] = [];
    stubApi({
      ...routes,
      'PATCH /api/projects/p1/tasks/t1': (body) =>
        new Promise<Response>((resolve) => {
          pending.push(() => resolve(routes['PATCH /api/projects/p1/tasks/t1'](body)));
        }),
    });

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);
    await chooseOption(wrapper.get(ASSIGNEE_SELECT), '未割り当て');
    await chooseOption(wrapper.get(LABEL_SELECT), '更新依頼');

    expect(pending).toHaveLength(2);
    expect(wrapper.get(ASSIGNEE_SELECT).text()).toBe('未割り当て');
    expect(wrapper.get(LABEL_SELECT).text()).toBe('更新依頼');

    for (const resolve of pending) resolve();
    await flushPromises();
    expect(wrapper.get(ASSIGNEE_SELECT).text()).toBe('未割り当て');
    expect(wrapper.get(LABEL_SELECT).text()).toBe('更新依頼');
  });

  it.each([
    ['assignee', ASSIGNEE_SELECT, 'Alice', 'Bob'],
    ['label', LABEL_SELECT, '更新依頼', 'バグ報告'],
  ])('reverts the %s when the PATCH fails', async (_field, selector, choice, original) => {
    let reject!: () => void;
    stubApi({
      ...baseRoutes('admin', () => [makeTask({ assignee: bob, label: bugLabel })]),
      'PATCH /api/projects/p1/tasks/t1': () =>
        new Promise<Response>((resolve) => {
          reject = () => resolve(json({ error: 'validation_error', issues: [] }, 400));
        }),
    });

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);
    await chooseOption(wrapper.get(selector), choice);
    expect(wrapper.get(selector).text()).toBe(choice);

    reject();
    await flushPromises();

    expect(wrapper.get(selector).text()).toBe(original);
    expect(wrapper.get('[role="alert"]').text()).toBe('操作に失敗しました');
  });

  it('renames the task', async () => {
    const requests = stubApi(patchingRoutes('admin', makeTask()));

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);
    const header = wrapper.get('[data-testid="task-header"]');
    await findButton(header, 'タイトルを編集').trigger('click');
    await header.get('input[aria-label="タイトル"]').setValue('Renamed');
    await header.get('[data-testid="task-title-form"]').trigger('submit');
    await flushPromises();

    expect(patchBodies(requests)).toEqual([{ title: 'Renamed' }]);
    expect(header.get('h2').text()).toBe('Renamed');
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

    const { wrapper } = await mountAt(TaskDetailView, PATH, bob);

    const timeline = wrapper.get('[data-testid="task-timeline"]');
    expect(timeline.get('[data-testid="description"]').text()).toBe('Spec body');
    expect(timeline.get('[data-testid="description-edited"]').text()).toBe('編集済み');
    expect(timeline.findAll('button').map((b) => b.text())).not.toContain('本文を編集');
  });

  it('hides an empty description and the edited mark for an untouched task', async () => {
    stubApi(baseRoutes('admin'));

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);

    expect(wrapper.find('[data-testid="description"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="description-edited"]').exists()).toBe(false);
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

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);
    const summary = wrapper.get('[data-testid="task-timeline"]');
    await findButton(summary, '本文を編集').trigger('click');
    await flushPromises();
    expect(editorFor(summary, '本文').getText()).toBe('Old body');

    await replaceContent(summary, '本文', 'New body');
    await summary.get('.task-description form').trigger('submit');
    await flushPromises();

    expect(patchBodies(requests)).toEqual([{ description: plainTextToRichTextDoc('New body') }]);
    expect(summary.get('[data-testid="description"]').text()).toBe('New body');
    expect(summary.find('[data-testid="description-edited"]').exists()).toBe(true);
    expect(localStorage.getItem('draft:t1:description')).toBeNull();
  });

  it('archives the task and keeps showing it as archived', async () => {
    const archivedAt = '2026-09-10T00:00:00.000Z';
    let task = makeTask();
    const requests = stubApi({
      ...baseRoutes('admin', () => [task]),
      'POST /api/projects/p1/tasks/t1/archive': () => {
        task = makeTask({ ...task, archivedAt });
        return json(task);
      },
    });

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);
    expect(wrapper.find('[data-testid="task-archived-at"]').exists()).toBe(false);

    await findButton(wrapper.get('[data-testid="task-sidebar"]'), 'アーカイブ').trigger('click');
    await flushPromises();

    expect(requestLines(requests)).toContain('POST /api/projects/p1/tasks/t1/archive');
    expect(wrapper.get('[data-testid="task-header"]').text()).toContain('アーカイブ済み');
    expect(buttonLabels(wrapper.get('[data-testid="task-sidebar"]'))).toEqual(['復元']);
    expect(wrapper.get('[data-testid="task-archived-at"]').text()).toBe(
      new Date(archivedAt).toLocaleString('ja-JP'),
    );
  });

  it('restores an archived task', async () => {
    let task = makeTask({ archivedAt: '2026-09-10T00:00:00.000Z' });
    const requests = stubApi({
      ...baseRoutes('admin', () => [task]),
      'POST /api/projects/p1/tasks/t1/unarchive': () => {
        task = makeTask({ ...task, archivedAt: null });
        return json(task);
      },
    });

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);
    const header = wrapper.get('[data-testid="task-header"]');
    const sidebar = wrapper.get('[data-testid="task-sidebar"]');
    expect(header.text()).toContain('アーカイブ済み');

    await findButton(sidebar, '復元').trigger('click');
    await flushPromises();

    expect(requestLines(requests)).toContain('POST /api/projects/p1/tasks/t1/unarchive');
    expect(header.text()).not.toContain('アーカイブ済み');
    expect(buttonLabels(sidebar)).toEqual(['アーカイブ']);
    expect(wrapper.find('[data-testid="task-archived-at"]').exists()).toBe(false);
  });

  it('shows an action error when archiving fails', async () => {
    stubApi({
      ...baseRoutes('admin'),
      'POST /api/projects/p1/tasks/t1/archive': json({ error: 'internal_error' }, 500),
    });

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);
    await findButton(wrapper.get('[data-testid="task-sidebar"]'), 'アーカイブ').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('操作に失敗しました');
  });

  it('posts a comment', async () => {
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

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);
    await typeInto(wrapper, 'コメント', 'Thanks');
    await wrapper.get('[data-testid="create-comment"]').trigger('submit');
    await flushPromises();

    expect(wrapper.findAll('[data-testid="comment"]').map((c) => c.text())).toEqual([
      expect.stringContaining('Bob'),
      expect.stringContaining('Alice'),
    ]);
    expect(editorFor(wrapper, 'コメント').isEmpty).toBe(true);
    const post = requests.mock.calls
      .map(([req]) => req)
      .find((req) => req.path.endsWith('/comments') && req.method === 'POST');
    expect(post?.body).toEqual({ body: plainTextToRichTextDoc('Thanks') });
  });

  it('shows a comment load error inside the timeline', async () => {
    stubApi({
      ...baseRoutes('admin'),
      'GET /api/projects/p1/tasks/t1/comments': json({ error: 'internal_error' }, 500),
    });

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);

    const card = wrapper.get('[data-testid="task-timeline"]');
    expect(card.get('[role="alert"]').text()).toBe('コメントの読み込みに失敗しました');
    expect(card.text()).not.toContain('コメントはありません');
  });

  it('ignores a stale comment response after moving to another task', async () => {
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

    const { wrapper, router } = await mountAt(TaskDetailView, PATH, alice);
    await router.push('/projects/p1/tasks/t2');
    await flushPromises();
    resolveFirst(json([makeComment({ body: plainTextToRichTextDoc('First thread') })]));
    await flushPromises();

    expect(wrapper.get('[data-testid="task-header"] h2').text()).toBe('Second');
    expect(
      wrapper.findAll('[data-testid="comment"]').map((c) => c.get('.comment-body').text()),
    ).toEqual(['Second thread']);
  });

  it('shows an empty state with a way back when the task does not exist', async () => {
    const requests = stubApi(baseRoutes('admin', () => [makeTask({ id: 't2' })]));

    const { wrapper } = await mountAt(TaskDetailView, PATH, alice);

    expect(wrapper.text()).toContain('タスクが見つかりません');
    expect(wrapper.find('[data-testid="task-header"]').exists()).toBe(false);
    const links = wrapper.findAll('a').filter((a) => a.text() === 'タスク一覧へ戻る');
    expect(links.map((a) => a.attributes('href'))).toEqual(['/projects/p1/tasks']);
    expect(requestLines(requests)).not.toContain('GET /api/projects/p1/tasks/t1/comments');
  });

  it('shows not found for projects the user is not a member of', async () => {
    stubApi({
      'GET /api/projects/p1': json({ error: 'not_found' }, 404),
      [TASKS]: json({ error: 'not_found' }, 404),
      'GET /api/projects/p1/members': json({ error: 'not_found' }, 404),
    });

    const { wrapper } = await mountAt(TaskDetailView, PATH, bob);

    expect(wrapper.get('[data-testid="project-not-found"]').text()).toContain(
      'プロジェクトが見つかりません',
    );
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="task-header"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('タスクが見つかりません');
  });
});
