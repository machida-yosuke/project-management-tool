import { flushPromises, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRole, Task } from '@pm-tool/shared';
import TimelineGrid from '../../src/components/calendar/TimelineGrid.vue';
import { TASK_ARCHIVE_HELP } from '../../src/lib/help-texts';
import ProjectCalendarView from '../../src/views/ProjectCalendarView.vue';
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
import { mountAt } from '../helpers/mount';
import { chooseOption } from '../helpers/reka-select';

const PATH = '/projects/p1/calendar?date=2026-09-15';

const activeTasks: Task[] = [
  makeTask({
    id: 't1',
    title: 'Design',
    startDate: '2026-09-14',
    endDate: '2026-09-16',
    label: makeLabel({ id: 'l1', color: '#3e63dd' }),
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
    'GET /api/projects/p1/members': json([makeMember(alice), makeMember(bob)]),
    'GET /api/projects/p1/labels': json([makeLabel({ id: 'l1' })]),
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

    expect(wrapper.find('h1').exists()).toBe(false);
    expect(wrapper.get('a[aria-current="page"]').text()).toBe('カレンダー');
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

    const toggle = wrapper.get('[role="checkbox"]');
    expect(wrapper.get(`label[for="${toggle.attributes('id')}"]`).text()).toBe(
      'アーカイブ済みも表示',
    );
    expect(document.body.textContent).not.toContain(TASK_ARCHIVE_HELP);
    await toggle.trigger('focusin');
    await flushPromises();
    expect(document.body.textContent).toContain(TASK_ARCHIVE_HELP);
    await toggle.trigger('click');
    await flushPromises();

    expect(rowIds(wrapper)).toContain('t5');

    expect(requestLines(requests)).toContain('GET /api/projects/p1/tasks?includeArchived=true');
    const archived = bands(wrapper, 't5')[0];
    expect(archived?.classes()).toContain('archived');
    expect(archived?.find('[data-testid="handle-start"]').exists()).toBe(false);
  });

  it('opens the task page from a band', async () => {
    stubApi(baseRoutes());

    const { wrapper, router } = await mountAt(ProjectCalendarView, PATH, alice);
    await openBand(wrapper, 't1');

    expect(router.currentRoute.value.name).toBe('task');
    expect(router.currentRoute.value.params).toEqual({ projectId: 'p1', taskId: 't1' });
    expect(wrapper.find('aside').exists()).toBe(false);
  });

  it('opens the task page from a row label', async () => {
    stubApi(baseRoutes());

    const { wrapper, router } = await mountAt(ProjectCalendarView, PATH, alice);
    await wrapper
      .get('[data-testid="task-row"][data-task-id="t3"] [data-testid="task-row-label"]')
      .trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/projects/p1/tasks/t3');
  });

  it('gives substaff a read-only calendar', async () => {
    stubApi(baseRoutes('substaff'));

    const { wrapper, router } = await mountAt(ProjectCalendarView, PATH, bob);

    expect(wrapper.find('[data-testid="handle-start"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="handle-end"]').exists()).toBe(false);

    await openBand(wrapper, 't1');
    expect(router.currentRoute.value.fullPath).toBe('/projects/p1/tasks/t1');
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

  it('filters tasks by assignee and label while keeping the date', async () => {
    stubApi(baseRoutes());

    const { wrapper, router } = await mountAt(ProjectCalendarView, PATH, alice);
    expect(wrapper.find('[aria-label="期間で絞り込む"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="並べ替え"]').exists()).toBe(false);

    await chooseOption(wrapper.get('[aria-label="担当者で絞り込む"]'), '未割り当て');
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ date: '2026-09-15', assignee: 'none' });
    expect(rowIds(wrapper)).toEqual(['t2', 't3', 't4']);

    await findButton(wrapper, '次へ').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ date: '2026-10-15', assignee: 'none' });

    await findButton(wrapper, '絞り込みを解除').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ date: '2026-10-15' });
    expect(rowIds(wrapper)).toEqual(['t1', 't2', 't3', 't4']);

    await chooseOption(wrapper.get('[aria-label="ラベルで絞り込む"]'), 'バグ報告');
    await flushPromises();
    expect(rowIds(wrapper)).toEqual(['t1']);
  });

  it('restores calendar filters from the URL and ignores the due filter', async () => {
    stubApi(baseRoutes());

    const { wrapper } = await mountAt(ProjectCalendarView, `${PATH}&label=none&due=overdue`, alice);

    expect(rowIds(wrapper)).toEqual(['t2', 't3', 't4']);
  });

  it('reports a missing project', async () => {
    stubApi({
      ...baseRoutes(),
      'GET /api/projects/p1': json({ error: 'not_found' }, 404),
    });

    const { wrapper } = await mountAt(ProjectCalendarView, PATH, alice);

    expect(wrapper.get('[data-testid="project-not-found"]').text()).toContain(
      'プロジェクトが見つかりません',
    );
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="timeline-grid"]').exists()).toBe(false);
  });
});
