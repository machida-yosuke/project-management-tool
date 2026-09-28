import { flushPromises, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  plainTextToRichTextDoc,
  type ProjectRole,
  type Task,
  type TaskComment,
} from '@pm-tool/shared';
import TimelineGrid from '../../src/components/calendar/TimelineGrid.vue';
import ProjectCalendarView from '../../src/views/ProjectCalendarView.vue';
import { alice, bob, json, makeProject, makeTask, stubApi } from '../helpers/api-mock';
import { mountAt } from '../helpers/mount';
import { replaceContent, typeInto } from '../helpers/rich-text';

const PATH = '/projects/p1/calendar?date=2026-09-15';

const comment: TaskComment = {
  id: 'c1',
  taskId: 't1',
  author: bob,
  body: plainTextToRichTextDoc('Looks good'),
  createdAt: '2026-09-02T00:00:00.000Z',
  editedAt: null,
};

const activeTasks: Task[] = [
  makeTask({
    id: 't1',
    title: 'Design',
    startDate: '2026-09-14',
    endDate: '2026-09-16',
    color: 'blue',
    assignee: bob,
  }),
  makeTask({
    id: 't2',
    title: 'Review',
    status: 'done',
    startDate: '2026-09-17',
    endDate: '2026-09-18',
  }),
  makeTask({ id: 't3', title: 'Someday' }),
  makeTask({ id: 't4', title: 'Release', startDate: '2026-09-26', endDate: '2026-10-03' }),
];
const archivedTask = makeTask({
  id: 't5',
  title: 'Old',
  startDate: '2026-09-08',
  endDate: '2026-09-09',
  archivedAt: '2026-09-10T00:00:00.000Z',
});

function baseRoutes(role: ProjectRole = 'staff') {
  return {
    'GET /api/projects/p1': json(makeProject({ role })),
    'GET /api/projects/p1/tasks': json(activeTasks),
    'GET /api/projects/p1/tasks?includeArchived=true': json([...activeTasks, archivedTask]),
    'GET /api/projects/p1/tasks/t1/comments': json([comment]),
  };
}

function findButton(scope: Pick<DOMWrapper<Element>, 'findAll'>, text: string) {
  const button = scope.findAll('button').find((b) => b.text() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

function bands(wrapper: VueWrapper, taskId?: string) {
  const selector = taskId
    ? `[data-testid="band"][data-task-id="${taskId}"]`
    : '[data-testid="band"]';
  return wrapper.findAll(selector);
}

function rowIds(wrapper: VueWrapper) {
  return wrapper.findAll('[data-testid="task-row"]').map((row) => row.attributes('data-task-id'));
}

function label(wrapper: VueWrapper) {
  return wrapper.get('[data-testid="calendar-label"]').text();
}

async function openBand(wrapper: VueWrapper, taskId: string) {
  const band = bands(wrapper, taskId)[0];
  if (!band) throw new Error(`Band not found: ${taskId}`);
  await band.trigger('pointerdown', { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
  await wrapper
    .get('[data-testid="timeline-grid"]')
    .trigger('pointerup', { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
  await flushPromises();
}

function requestLines(requests: ReturnType<typeof stubApi>) {
  return requests.mock.calls.map(([req]) => `${req.method} ${req.path}`);
}

describe('ProjectCalendarView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the month containing the requested date', async () => {
    stubApi(baseRoutes());

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);

    expect(wrapper.get('h2').text()).toBe('Project One のカレンダー');
    expect(label(wrapper)).toBe('2026年9月');
    const headers = wrapper.findAll('[data-date]');
    expect(headers).toHaveLength(30);
    expect(headers[0]?.attributes('data-date')).toBe('2026-09-01');
    expect(headers.at(-1)?.attributes('data-date')).toBe('2026-09-30');
  });

  it('gives every task a row and draws bands for the dated ones', async () => {
    stubApi(baseRoutes());

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);

    expect(rowIds(wrapper)).toEqual(['t1', 't2', 't3', 't4']);
    expect(bands(wrapper)).toHaveLength(3);
    expect(bands(wrapper, 't3')).toHaveLength(0);
    expect(
      wrapper.get('[data-testid="task-row"][data-task-id="t3"] [data-testid="undated"]').text(),
    ).toBe('日付未設定');
    expect(bands(wrapper, 't4')).toHaveLength(1);
    expect(bands(wrapper, 't4')[0]?.classes()).toContain('clip-end');
    expect(bands(wrapper, 't2')[0]?.classes()).toContain('done');
    expect(bands(wrapper, 't1')[0]?.text()).toBe('Design');
    expect(bands(wrapper, 't1')[0]?.attributes('style')).toContain('left: 520px');
  });

  it('switches to a single week', async () => {
    stubApi(baseRoutes());

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);
    await findButton(wrapper, '週').trigger('click');

    expect(label(wrapper)).toBe('2026年9月14日〜9月20日');
    expect(wrapper.findAll('[data-date]')).toHaveLength(7);
    expect(wrapper.findAll('[data-date]')[0]?.attributes('data-date')).toBe('2026-09-14');
    expect(rowIds(wrapper)).toEqual(['t1', 't2', 't3', 't4']);
    expect(findButton(wrapper, '週').attributes('aria-pressed')).toBe('true');
    expect(findButton(wrapper, '月').attributes('aria-pressed')).toBe('false');
    expect(bands(wrapper).map((b) => b.attributes('data-task-id'))).toEqual(['t1', 't2']);

    await findButton(wrapper, '次へ').trigger('click');
    await flushPromises();
    expect(label(wrapper)).toBe('2026年9月21日〜9月27日');
  });

  it('navigates between months and reflects the date in the query', async () => {
    stubApi(baseRoutes());

    const { wrapper, router } = await mountAt(ProjectCalendarView, PATH, alice);

    await findButton(wrapper, '次へ').trigger('click');
    await flushPromises();
    expect(label(wrapper)).toBe('2026年10月');
    expect(router.currentRoute.value.query.date).toBe('2026-10-15');

    await findButton(wrapper, '前へ').trigger('click');
    await findButton(wrapper, '前へ').trigger('click');
    await flushPromises();
    expect(label(wrapper)).toBe('2026年8月');
    expect(wrapper.findAll('[data-date]')).toHaveLength(31);
  });

  it('jumps to today and highlights it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 3, 9, 0));
    stubApi(baseRoutes());

    const { wrapper, router } = await mountAt(ProjectCalendarView, PATH, alice);
    await findButton(wrapper, '今日').trigger('click');
    await flushPromises();

    expect(label(wrapper)).toBe('2026年11月');
    expect(router.currentRoute.value.query.date).toBe('2026-11-03');
    expect(wrapper.get('[data-date="2026-11-03"]').classes()).toContain('today');
  });

  it('includes archived tasks on demand', async () => {
    const requests = stubApi(baseRoutes());

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);
    expect(bands(wrapper, 't5')).toHaveLength(0);
    expect(rowIds(wrapper)).not.toContain('t5');

    await wrapper.get('input[aria-label="アーカイブを表示"]').setValue(true);
    await flushPromises();

    expect(rowIds(wrapper)).toContain('t5');

    expect(requestLines(requests)).toContain('GET /api/projects/p1/tasks?includeArchived=true');
    const archived = bands(wrapper, 't5')[0];
    expect(archived?.classes()).toContain('archived');
    expect(archived?.find('[data-testid="handle-start"]').exists()).toBe(false);
  });

  it('opens a panel with the task details and comments', async () => {
    stubApi(baseRoutes());

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);
    expect(wrapper.find('[data-testid="task-panel"]').exists()).toBe(false);

    await openBand(wrapper, 't1');

    const panel = wrapper.get('[data-testid="task-panel"]');
    expect(panel.element.tagName).toBe('ASIDE');
    expect(panel.get('h3').text()).toBe('Design');
    expect(panel.text()).toContain('未完了');
    expect(panel.text()).toContain('Bob');
    expect(panel.text()).toContain('2026-09-14 〜 2026-09-16');
    expect(panel.findAll('[data-testid="comment"]').map((c) => c.text())).toEqual([
      expect.stringContaining('Looks good'),
    ]);
    expect(panel.get('button[aria-label="色: 青"]').attributes('aria-pressed')).toBe('true');
    expect(panel.get('button[aria-label="色: 赤"]').attributes('aria-pressed')).toBe('false');
    expect(panel.find('[data-testid="create-comment"]').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-testid="task-panel"]').exists()).toBe(false);
  });

  it('opens the panel from a row label', async () => {
    stubApi(baseRoutes());

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);
    await wrapper
      .get('[data-testid="task-row"][data-task-id="t3"] [data-testid="task-row-label"]')
      .trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="task-panel"] h3').text()).toBe('Someday');
  });

  it('closes the panel with the close button', async () => {
    stubApi(baseRoutes());

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);
    await openBand(wrapper, 't1');
    await wrapper.get('[data-testid="task-panel"] button[aria-label="閉じる"]').trigger('click');

    expect(wrapper.find('[data-testid="task-panel"]').exists()).toBe(false);
  });

  it('posts a comment', async () => {
    const requests = stubApi({
      ...baseRoutes(),
      'POST /api/projects/p1/tasks/t1/comments': json(
        { ...comment, id: 'c2', body: plainTextToRichTextDoc('New') },
        201,
      ),
    });

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);
    await openBand(wrapper, 't1');
    await typeInto(wrapper, 'コメント', 'New');
    await wrapper.get('[data-testid="create-comment"]').trigger('submit');
    await flushPromises();

    const post = requests.mock.calls
      .map(([req]) => req)
      .find((req) => req.method === 'POST' && req.path.endsWith('/comments'));
    expect(post?.body).toEqual({ body: plainTextToRichTextDoc('New') });
  });

  it('changes the color from a swatch', async () => {
    const requests = stubApi({
      ...baseRoutes(),
      'PATCH /api/projects/p1/tasks/t1': json(makeTask({ id: 't1', color: 'teal' })),
    });

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);
    await openBand(wrapper, 't1');
    await wrapper.get('button[aria-label="色: 青緑"]').trigger('click');
    await flushPromises();

    const patch = requests.mock.calls.map(([req]) => req).find((req) => req.method === 'PATCH');
    expect(patch?.body).toEqual({ color: 'teal' });
  });

  it('archives the selected task and closes the panel', async () => {
    const requests = stubApi({
      ...baseRoutes(),
      'POST /api/projects/p1/tasks/t1/archive': json(
        makeTask({ id: 't1', archivedAt: '2026-09-28T00:00:00.000Z' }),
      ),
    });

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);
    await openBand(wrapper, 't1');
    await findButton(wrapper.get('[data-testid="task-panel"]'), 'アーカイブ').trigger('click');
    await flushPromises();

    expect(requestLines(requests)).toContain('POST /api/projects/p1/tasks/t1/archive');
    expect(wrapper.find('[data-testid="task-panel"]').exists()).toBe(false);
  });

  it('marks an edited description in the panel', async () => {
    stubApi({
      ...baseRoutes('substaff'),
      'GET /api/projects/p1/tasks': json([
        makeTask({
          ...activeTasks[0],
          description: plainTextToRichTextDoc('Design notes'),
          descriptionEditedAt: '2026-09-05T00:00:00.000Z',
        }),
      ]),
    });

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, bob);
    await openBand(wrapper, 't1');

    const panel = wrapper.get('[data-testid="task-panel"]');
    expect(panel.get('[data-testid="description"]').text()).toBe('Design notes');
    expect(panel.get('[data-testid="description-edited"]').text()).toBe('更新履歴あり');
    expect(panel.findAll('button').map((b) => b.text())).not.toContain('本文を編集');
  });

  it('edits the description from the panel', async () => {
    const requests = stubApi({
      ...baseRoutes(),
      'PATCH /api/projects/p1/tasks/t1': (body) =>
        json(makeTask({ id: 't1', ...(body as Partial<Task>) })),
    });

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);
    await openBand(wrapper, 't1');
    const panel = wrapper.get('[data-testid="task-panel"]');
    await findButton(panel, '本文を編集').trigger('click');
    await flushPromises();
    await replaceContent(panel, '本文', 'Panel body');
    await panel.get('.task-description form').trigger('submit');
    await flushPromises();

    const patch = requests.mock.calls.map(([req]) => req).find((req) => req.method === 'PATCH');
    expect(patch?.body).toEqual({ description: plainTextToRichTextDoc('Panel body') });
    expect(panel.find('.task-description form').exists()).toBe(false);
  });

  it('gives substaff a read-only calendar', async () => {
    stubApi(baseRoutes('substaff'));

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, bob);

    expect(wrapper.find('[data-testid="handle-start"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="handle-end"]').exists()).toBe(false);

    await openBand(wrapper, 't1');
    const panel = wrapper.get('[data-testid="task-panel"]');
    expect(panel.find('button[aria-label^="色:"]').exists()).toBe(false);
    expect(panel.findAll('button').map((b) => b.text())).not.toContain('アーカイブ');
    expect(panel.find('[data-testid="create-comment"]').exists()).toBe(false);
    expect(panel.text()).toContain('Looks good');
  });

  it('saves dragged dates', async () => {
    const requests = stubApi({
      ...baseRoutes(),
      'PATCH /api/projects/p1/tasks/t1': json(makeTask({ id: 't1' })),
    });

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);
    wrapper
      .findComponent(TimelineGrid)
      .vm.$emit('commit', { taskId: 't1', startDate: '2026-09-21', endDate: '2026-09-23' });
    await flushPromises();

    const patch = requests.mock.calls.map(([req]) => req).find((req) => req.method === 'PATCH');
    expect(patch?.body).toEqual({ startDate: '2026-09-21', endDate: '2026-09-23' });
  });

  it('shows the new dates while saving and restores them when saving fails', async () => {
    let fail: () => void = () => undefined;
    stubApi({
      ...baseRoutes(),
      'PATCH /api/projects/p1/tasks/t1': () =>
        new Promise<Response>((resolve) => {
          fail = () => resolve(json({ error: 'internal_error' }, 500));
        }),
    });

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);
    const bandLeft = () =>
      /left: (\d+)px/.exec(bands(wrapper, 't1')[0]?.attributes('style') ?? '')?.[1];
    expect(bandLeft()).toBe('520');

    wrapper
      .findComponent(TimelineGrid)
      .vm.$emit('commit', { taskId: 't1', startDate: '2026-09-21', endDate: '2026-09-23' });
    await flushPromises();
    expect(bandLeft()).toBe('800');

    fail();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('操作に失敗しました');
    expect(bandLeft()).toBe('520');
  });

  it('reports a missing project', async () => {
    stubApi({
      ...baseRoutes(),
      'GET /api/projects/p1': json({ error: 'not_found' }, 404),
    });

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);

    expect(wrapper.get('[role="alert"]').text()).toBe('プロジェクトが見つかりません');
    expect(wrapper.find('[data-testid="timeline-grid"]').exists()).toBe(false);
  });
});
