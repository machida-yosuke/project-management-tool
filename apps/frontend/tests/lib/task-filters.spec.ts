import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TASK_FILTERS,
  applyTaskFilters,
  filtersFromQuery,
  isFiltering,
  sortFromQuery,
  sortTasks,
  withTaskQuery,
} from '../../src/lib/task-filters';
import { bob, makeLabel, makeTask } from '../helpers/api-mock';

// A Wednesday; its week runs from 2026-09-28 (Mon) to 2026-10-04 (Sun).
const TODAY = '2026-09-30';

function ids(tasks: { id: string }[]) {
  return tasks.map((task) => task.id);
}

describe('filtersFromQuery / sortFromQuery', () => {
  it('falls back to defaults for an empty query', () => {
    expect(filtersFromQuery({})).toEqual(DEFAULT_TASK_FILTERS);
    expect(sortFromQuery({})).toBe('created');
  });

  it('reads every key', () => {
    expect(
      filtersFromQuery({ assignee: 'u-bob', label: 'none', due: 'overdue', sort: 'end' }),
    ).toEqual({ assignee: 'u-bob', label: 'none', due: 'overdue' });
    expect(sortFromQuery({ sort: 'updated' })).toBe('updated');
  });

  it('ignores unknown or malformed values', () => {
    expect(filtersFromQuery({ assignee: '', label: null, due: 'later' })).toEqual(
      DEFAULT_TASK_FILTERS,
    );
    expect(sortFromQuery({ sort: 'title' })).toBe('created');
    expect(filtersFromQuery({ assignee: ['u-bob', 'u-alice'] }).assignee).toBe('u-bob');
  });
});

describe('withTaskQuery', () => {
  it('omits defaults and keeps unrelated keys', () => {
    expect(
      withTaskQuery(
        { date: '2026-09-15', assignee: 'u-bob', sort: 'end' },
        DEFAULT_TASK_FILTERS,
        'created',
      ),
    ).toEqual({ date: '2026-09-15' });
  });

  it('writes non-default values', () => {
    expect(withTaskQuery({}, { assignee: 'none', label: 'l1', due: 'week' }, 'updated')).toEqual({
      assignee: 'none',
      label: 'l1',
      due: 'week',
      sort: 'updated',
    });
  });

  it('round-trips through the parsers', () => {
    const filters = { assignee: 'u-bob', label: null, due: 'unset' } as const;
    const query = withTaskQuery({}, filters, 'end');
    expect(filtersFromQuery(query)).toEqual(filters);
    expect(sortFromQuery(query)).toBe('end');
  });
});

describe('isFiltering', () => {
  it('is false only for the defaults', () => {
    expect(isFiltering(DEFAULT_TASK_FILTERS)).toBe(false);
    expect(isFiltering({ ...DEFAULT_TASK_FILTERS, assignee: 'none' })).toBe(true);
    expect(isFiltering({ ...DEFAULT_TASK_FILTERS, label: 'l1' })).toBe(true);
    expect(isFiltering({ ...DEFAULT_TASK_FILTERS, due: 'week' })).toBe(true);
  });
});

describe('applyTaskFilters', () => {
  const bug = makeLabel({ id: 'l1' });
  const docs = makeLabel({ id: 'l2', name: 'ドキュメント' });
  const tasks = [
    makeTask({ id: 'bob-bug', assignee: bob, label: bug }),
    makeTask({ id: 'nobody-docs', label: docs }),
    makeTask({ id: 'nobody-none' }),
  ];

  it('returns every task with the defaults', () => {
    expect(ids(applyTaskFilters(tasks, DEFAULT_TASK_FILTERS, TODAY))).toEqual([
      'bob-bug',
      'nobody-docs',
      'nobody-none',
    ]);
  });

  it('filters by assignee, including unassigned', () => {
    const by = (assignee: string) =>
      ids(applyTaskFilters(tasks, { ...DEFAULT_TASK_FILTERS, assignee }, TODAY));
    expect(by(bob.id)).toEqual(['bob-bug']);
    expect(by('none')).toEqual(['nobody-docs', 'nobody-none']);
    expect(by('u-ghost')).toEqual([]);
  });

  it('filters by label, including unlabeled', () => {
    const by = (label: string) =>
      ids(applyTaskFilters(tasks, { ...DEFAULT_TASK_FILTERS, label }, TODAY));
    expect(by('l2')).toEqual(['nobody-docs']);
    expect(by('none')).toEqual(['nobody-none']);
  });

  it('combines conditions', () => {
    expect(
      ids(applyTaskFilters(tasks, { assignee: 'none', label: 'l2', due: 'all' }, TODAY)),
    ).toEqual(['nobody-docs']);
  });

  describe('by due', () => {
    const dated = [
      makeTask({ id: 'overdue', endDate: '2026-09-29' }),
      makeTask({ id: 'overdue-done', endDate: '2026-09-29', status: 'done' }),
      makeTask({ id: 'today', endDate: '2026-09-30' }),
      makeTask({ id: 'monday', endDate: '2026-09-28' }),
      makeTask({ id: 'sunday', endDate: '2026-10-04' }),
      makeTask({ id: 'next-week', endDate: '2026-10-05' }),
      makeTask({ id: 'last-week', endDate: '2026-09-27' }),
      makeTask({ id: 'start-only', startDate: '2026-09-30' }),
      makeTask({ id: 'undated' }),
    ];
    const by = (due: 'overdue' | 'week' | 'unset') =>
      ids(applyTaskFilters(dated, { ...DEFAULT_TASK_FILTERS, due }, TODAY));

    it('treats only unfinished tasks ending before today as overdue', () => {
      expect(by('overdue')).toEqual(['overdue', 'monday', 'last-week']);
    });

    it('matches end dates within the Monday-to-Sunday week of today', () => {
      expect(by('week')).toEqual(['overdue', 'overdue-done', 'today', 'monday', 'sunday']);
    });

    it('matches tasks with neither a start nor an end date as unset', () => {
      expect(by('unset')).toEqual(['undated']);
    });
  });
});

describe('sortTasks', () => {
  const tasks = [
    makeTask({
      id: 'a',
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
      endDate: null,
    }),
    makeTask({
      id: 'b',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
      endDate: '2026-09-20',
    }),
    makeTask({
      id: 'c',
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z',
      endDate: '2026-09-15',
    }),
    makeTask({
      id: 'd',
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      endDate: null,
    }),
  ];

  it('orders by creation time, keeping ties in their original order', () => {
    expect(ids(sortTasks(tasks, 'created'))).toEqual(['b', 'a', 'c', 'd']);
  });

  it('orders by nearest end date with unset ones last', () => {
    expect(ids(sortTasks(tasks, 'end'))).toEqual(['c', 'b', 'a', 'd']);
  });

  it('orders by most recently updated', () => {
    expect(ids(sortTasks(tasks, 'updated'))).toEqual(['b', 'c', 'a', 'd']);
  });

  it('does not mutate the input', () => {
    sortTasks(tasks, 'end');
    expect(ids(tasks)).toEqual(['a', 'b', 'c', 'd']);
  });
});
