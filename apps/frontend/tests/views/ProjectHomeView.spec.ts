import {
  enableAutoUnmount,
  flushPromises,
  type DOMWrapper,
  type VueWrapper,
} from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plainTextToRichTextDoc, type Project, type ProjectRole, type Task } from '@pm-tool/shared';
import type { ProjectComment } from '../../src/api/generated/models';
import ProjectHomeView from '../../src/views/ProjectHomeView.vue';
import { alice, bob, json, makeLabel, makeProject, makeTask, stubApi } from '../helpers/api-mock';
import { currentDialog } from '../helpers/dialog';
import { inputValue, mountAt } from '../helpers/mount';
import { editorFor, replaceContent } from '../helpers/rich-text';

const PATH = '/projects/p1';
const COMMENTS = 'GET /api/projects/p1/comments?limit=5';

function makeComment(overrides: Partial<ProjectComment> = {}): ProjectComment {
  return {
    id: 'c1',
    taskId: 't1',
    author: bob,
    body: plainTextToRichTextDoc('Looks good'),
    createdAt: new Date(2026, 8, 30, 10, 0).toISOString(),
    editedAt: null,
    task: { id: 't1', title: 'Write spec' },
    ...overrides,
  };
}

function baseRoutes(
  role: ProjectRole,
  tasks: () => Task[] = () => [],
  comments: () => ProjectComment[] = () => [],
) {
  return {
    'GET /api/projects/p1': json(makeProject({ role })),
    'GET /api/projects/p1/tasks': () => json(tasks()),
    [COMMENTS]: () => json(comments()),
  };
}

const EDIT_PROJECT = 'button[aria-label="プロジェクトを編集"]';

function editableProject(role: ProjectRole = 'admin') {
  let current = makeProject({ role, description: plainTextToRichTextDoc('Old summary') });
  return stubApi({
    ...baseRoutes(role),
    'GET /api/projects/p1': () => json(current),
    'GET /api/projects': () => json([current]),
    'PATCH /api/projects/p1': (body) => {
      current = { ...current, ...(body as Partial<Project>) };
      return json(current);
    },
  });
}

async function openEditProject(wrapper: VueWrapper) {
  await wrapper.get(EDIT_PROJECT).trigger('click');
  await flushPromises();
  const dialog = currentDialog();
  if (!dialog) throw new Error('Edit project dialog did not open');
  return dialog;
}

function findButton(scope: Pick<DOMWrapper<Element>, 'findAll'>, text: string) {
  const button = scope.findAll('button').find((b) => b.text() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

function weekTaskRows(wrapper: VueWrapper) {
  return wrapper.findAll('[data-testid="week-task"]').map((row) => ({
    title: row.get('[data-testid="week-task-open"]').text(),
    period: row.get('[data-testid="week-task-period"]').text(),
  }));
}

describe('ProjectHomeView', () => {
  enableAutoUnmount(afterEach);

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    // Wednesday; the Monday-first week is 2026-09-28 .. 2026-10-04.
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the project header with the home tab as current', async () => {
    stubApi(baseRoutes('substaff'));

    const { wrapper } = await mountAt(ProjectHomeView, PATH, bob);

    expect(wrapper.get('h1').text()).toBe('Project One');
    const nav = wrapper.get('nav[aria-label="プロジェクト"]');
    expect(nav.get('a[aria-current="page"]').text()).toBe('ホーム');
  });

  it('shows the project description as rich text', async () => {
    stubApi({
      ...baseRoutes('staff'),
      'GET /api/projects/p1': json(
        makeProject({ role: 'staff', description: plainTextToRichTextDoc('Line 1\nLine 2') }),
      ),
    });

    const { wrapper } = await mountAt(ProjectHomeView, PATH, bob);

    const paragraphs = wrapper.get('[data-testid="project-description"]').findAll('p');
    expect(paragraphs.map((p) => p.text())).toEqual(['Line 1', 'Line 2']);
  });

  it('hides an empty project description', async () => {
    stubApi(baseRoutes('staff'));

    const { wrapper } = await mountAt(ProjectHomeView, PATH, bob);

    expect(wrapper.find('[data-testid="project-description"]').exists()).toBe(false);
  });

  it.each(['admin', 'staff'] as const)('prefills the edit project dialog for %s', async (role) => {
    editableProject(role);

    const { wrapper } = await mountAt(ProjectHomeView, PATH, bob);
    const dialog = await openEditProject(wrapper);

    expect(dialog.text()).toContain('プロジェクトを編集');
    expect(inputValue(dialog.get('input[aria-label="プロジェクトの名前"]'))).toBe('Project One');
    expect(editorFor(dialog, '概要').getText()).toBe('Old summary');
  });

  it('saves the name and description in one request and refetches the project', async () => {
    const requests = editableProject();

    const { wrapper } = await mountAt(ProjectHomeView, PATH, alice);
    const form = (await openEditProject(wrapper)).get('[data-testid="edit-project"]');
    await form.get('input[aria-label="プロジェクトの名前"]').setValue('  Renamed  ');
    await replaceContent(form, '概要', 'New summary');
    await form.trigger('submit');
    await flushPromises();

    const calls = requests.mock.calls.map(([req]) => req);
    expect(calls.filter((req) => req.method === 'PATCH').map((req) => req.body)).toEqual([
      { name: 'Renamed', description: plainTextToRichTextDoc('New summary') },
    ]);
    expect(
      calls.filter((req) => req.method === 'GET' && req.path === '/api/projects/p1'),
    ).toHaveLength(2);
    expect(currentDialog()).toBeNull();
    expect(wrapper.get('h1').text()).toBe('Renamed');
    expect(wrapper.get('[data-testid="project-description"]').text()).toBe('New summary');
    expect(localStorage.getItem('draft:project:p1:description')).toBeNull();

    const reopened = await openEditProject(wrapper);
    expect(inputValue(reopened.get('input[aria-label="プロジェクトの名前"]'))).toBe('Renamed');
    expect(editorFor(reopened, '概要').getText()).toBe('New summary');
  });

  it('shows an edit project error inside the dialog and keeps it open', async () => {
    stubApi({
      ...baseRoutes('admin'),
      'PATCH /api/projects/p1': json({ error: 'validation_error' }, 400),
    });

    const { wrapper } = await mountAt(ProjectHomeView, PATH, alice);
    const form = (await openEditProject(wrapper)).get('[data-testid="edit-project"]');
    await form.trigger('submit');
    await flushPromises();

    expect(currentDialog()).not.toBeNull();
    expect(form.get('[role="alert"]').text()).toBe(
      '名前は1〜200文字、概要は正しい形式で入力してください',
    );
  });

  it('restores the description draft but resets the name when reopening', async () => {
    editableProject();

    const { wrapper } = await mountAt(ProjectHomeView, PATH, alice);
    const dialog = await openEditProject(wrapper);
    await dialog.get('input[aria-label="プロジェクトの名前"]').setValue('Unsaved name');
    await replaceContent(dialog, '概要', 'Unsaved summary');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(localStorage.getItem('draft:project:p1:description')).not.toBeNull();
    await findButton(dialog, '閉じる').trigger('click');
    await flushPromises();
    expect(currentDialog()).toBeNull();

    const reopened = await openEditProject(wrapper);
    expect(inputValue(reopened.get('input[aria-label="プロジェクトの名前"]'))).toBe('Project One');
    expect(editorFor(reopened, '概要').getText()).toBe('Unsaved summary');
  });

  it('hides the edit project control for substaff', async () => {
    stubApi(baseRoutes('substaff'));

    const { wrapper } = await mountAt(ProjectHomeView, PATH, bob);

    expect(wrapper.find(EDIT_PROJECT).exists()).toBe(false);
  });

  it('lists tasks whose period overlaps this week, ordered by start date', async () => {
    stubApi(
      baseRoutes('staff', () => [
        makeTask({ id: 'before', title: 'Before', startDate: '2026-09-20', endDate: '2026-09-27' }),
        makeTask({ id: 'end-only', title: 'End only', endDate: '2026-09-30' }),
        makeTask({ id: 'monday', title: 'Monday', startDate: '2026-09-25', endDate: '2026-09-28' }),
        makeTask({ id: 'after', title: 'After', startDate: '2026-10-05' }),
        makeTask({ id: 'sunday', title: 'Sunday', startDate: '2026-10-04', endDate: '2026-10-10' }),
        makeTask({ id: 'undated', title: 'Undated' }),
        makeTask({ id: 'start-only', title: 'Start only', startDate: '2026-09-29' }),
        makeTask({
          id: 'spanning',
          title: 'Spanning',
          status: 'done',
          startDate: '2026-09-01',
          endDate: '2026-10-31',
          assignee: bob,
          label: makeLabel({ name: '更新依頼', color: '#3e63dd' }),
        }),
      ]),
    );

    const { wrapper } = await mountAt(ProjectHomeView, PATH, bob);

    expect(weekTaskRows(wrapper)).toEqual([
      { title: 'Spanning', period: '2026-09-01 〜 2026-10-31' },
      { title: 'Monday', period: '2026-09-25 〜 2026-09-28' },
      { title: 'Start only', period: '2026-09-29 〜' },
      { title: 'Sunday', period: '2026-10-04 〜 2026-10-10' },
      { title: 'End only', period: '〜 2026-09-30' },
    ]);
    const first = wrapper.get('[data-testid="week-task"]');
    expect(first.get('[role="img"]').attributes('aria-label')).toBe('完了');
    expect(first.get('[data-testid="week-task-open"]').attributes('href')).toBe(
      '/projects/p1/tasks/spanning',
    );
    expect(first.get('[data-testid="week-task-assignee"]').attributes('title')).toBe('Bob');
    expect(first.get('[data-testid="week-task-label"]').text()).toBe('更新依頼');
    const second = wrapper.findAll('[data-testid="week-task"]')[1];
    expect(second?.find('[data-testid="week-task-assignee"]').exists()).toBe(false);
    expect(second?.find('[data-testid="week-task-label"]').exists()).toBe(false);
  });

  it('shows at most five tasks for this week', async () => {
    const tasks = [
      '2026-10-03',
      '2026-09-28',
      '2026-10-01',
      '2026-09-30',
      '2026-10-02',
      '2026-09-29',
    ].map((date, i) => makeTask({ id: `t${i}`, title: date, startDate: date, endDate: date }));
    stubApi(baseRoutes('staff', () => tasks));

    const { wrapper } = await mountAt(ProjectHomeView, PATH, bob);

    expect(weekTaskRows(wrapper).map((row) => row.title)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('requests only unarchived tasks', async () => {
    const requests = stubApi(baseRoutes('staff'));

    await mountAt(ProjectHomeView, PATH, bob);

    const paths = requests.mock.calls.map(([req]) => `${req.method} ${req.path}`);
    expect(paths).toContain('GET /api/projects/p1/tasks');
    expect(paths).not.toContain('GET /api/projects/p1/tasks?includeArchived=true');
  });

  it('shows the latest comments with their author, time and task', async () => {
    stubApi(
      baseRoutes(
        'staff',
        () => [],
        () => [
          makeComment(),
          makeComment({
            id: 'c2',
            taskId: 't2',
            author: alice,
            body: plainTextToRichTextDoc('Shipped'),
            createdAt: new Date(2026, 8, 28, 12, 0).toISOString(),
            task: { id: 't2', title: 'Release' },
          }),
        ],
      ),
    );

    const { wrapper } = await mountAt(ProjectHomeView, PATH, bob);

    const rows = wrapper.findAll('[data-testid="recent-comment"]').map((row) => ({
      author: row.get('[data-testid="recent-comment-author"]').text(),
      time: row.get('time').text(),
      body: row.get('[data-testid="recent-comment-body"]').text(),
      task: row.get('[data-testid="recent-comment-task"]').text(),
      href: row.get('[data-testid="recent-comment-task"]').attributes('href'),
    }));
    expect(rows).toEqual([
      {
        author: 'Bob',
        time: '2 時間前',
        body: 'Looks good',
        task: 'Write spec',
        href: '/projects/p1/tasks/t1',
      },
      {
        author: 'Alice',
        time: '2 日前',
        body: 'Shipped',
        task: 'Release',
        href: '/projects/p1/tasks/t2',
      },
    ]);
  });

  it('shows empty states when there are no tasks this week and no comments', async () => {
    stubApi(baseRoutes('staff', () => [makeTask({ startDate: '2026-10-05' })]));

    const { wrapper } = await mountAt(ProjectHomeView, PATH, bob);

    expect(wrapper.find('[data-testid="week-task"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('今週のタスクはありません');
    expect(wrapper.find('[data-testid="recent-comment"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('コメントはありません');
  });

  it('shows not found for projects the user is not a member of', async () => {
    stubApi({
      'GET /api/projects/p1': json({ error: 'not_found' }, 404),
      'GET /api/projects/p1/tasks': json({ error: 'not_found' }, 404),
      [COMMENTS]: json({ error: 'not_found' }, 404),
    });

    const { wrapper } = await mountAt(ProjectHomeView, PATH, bob);

    expect(wrapper.get('[role="alert"]').text()).toBe('プロジェクトが見つかりません');
    expect(wrapper.find('h1').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('今週のタスク');
  });
});
