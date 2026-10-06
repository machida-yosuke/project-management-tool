import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@pm-tool/shared';
import TimelineGrid from '../../../src/components/calendar/TimelineGrid.vue';
import { LONG_PRESS_MS } from '../../../src/components/calendar/useBandDrag';
import { MEASURE_CELLS_KEY, type DayCellRect } from '../../../src/lib/calendar-drag';
import { addDays } from '../../../src/lib/dates';
import { makeLabel, makeTask } from '../../helpers/api-mock';

const COLUMN = 40;
const LABEL = 200;
const dates = Array.from({ length: 14 }, (_, i) => addDays('2026-09-28', i));

// Date columns start right of the 200px task-name column.
const cells: DayCellRect[] = dates.map((date, col) => ({
  date,
  rect: { left: LABEL + col * COLUMN, right: LABEL + (col + 1) * COLUMN },
}));

function x(col: number, offset = COLUMN / 2) {
  return LABEL + col * COLUMN + offset;
}

function mountGrid(
  tasks: Task[],
  props: Partial<{
    editable: boolean;
    dateOverrides: Record<string, { startDate: string; endDate: string }>;
  }> = {},
) {
  return mount(TimelineGrid, {
    props: {
      dates,
      tasks,
      editable: true,
      today: '2026-09-30',
      dateOverrides: {},
      columnWidth: COLUMN,
      ...props,
    },
    global: { provide: { [MEASURE_CELLS_KEY]: () => cells } },
  });
}

const task = makeTask({
  id: 't1',
  startDate: '2026-09-29',
  endDate: '2026-10-01',
  label: makeLabel({ color: '#3e63dd' }),
});

function pointer(clientX: number) {
  return { clientX, clientY: 10, pointerId: 1, button: 0 };
}

function touch(clientX: number, clientY = 10) {
  return { clientX, clientY, pointerId: 2, button: 0, pointerType: 'touch' };
}

function band(wrapper: VueWrapper) {
  return wrapper.get('[data-testid="band"]');
}

function grid(wrapper: VueWrapper) {
  return wrapper.get('[data-testid="timeline-grid"]');
}

async function dragOnGrid(wrapper: VueWrapper, to: number) {
  await grid(wrapper).trigger('pointermove', pointer(to));
  await grid(wrapper).trigger('pointerup', pointer(to));
}

describe('TimelineGrid', () => {
  it('renders one header column per date with weekday, weekend and today marks', () => {
    const wrapper = mountGrid([]);
    const headers = wrapper.findAll('[data-date]');

    expect(headers).toHaveLength(14);
    expect(headers[0]?.text()).toBe('9/28月');
    expect(headers[6]?.text()).toBe('10/4日');
    expect(headers[5]?.classes()).toContain('weekend');
    expect(headers[6]?.classes()).toContain('weekend');
    expect(headers[4]?.classes()).not.toContain('weekend');
    expect(wrapper.get('[data-date="2026-09-30"]').classes()).toContain('today');
  });

  it('renders a row per task in the given order', () => {
    const wrapper = mountGrid([
      makeTask({ id: 'b', title: 'B' }),
      makeTask({ id: 'a', title: 'A' }),
      makeTask({ id: 'c', title: 'C' }),
    ]);
    const rows = wrapper.findAll('[data-testid="task-row"]');

    expect(rows.map((row) => row.attributes('data-task-id'))).toEqual(['b', 'a', 'c']);
    expect(rows.map((row) => row.get('[data-testid="task-row-label"]').text())).toEqual([
      'B',
      'A',
      'C',
    ]);
  });

  it('draws a band positioned in pixels of the column width', () => {
    const wrapper = mountGrid([task]);
    const style = band(wrapper).attributes('style') ?? '';

    expect(style).toContain('left: 40px');
    expect(style).toContain('width: 120px');
    expect(band(wrapper).text()).toBe(task.title);
  });

  it('colors the band by its label and falls back to gray without one', () => {
    const wrapper = mountGrid([
      task,
      makeTask({ id: 't2', startDate: '2026-09-29', endDate: '2026-09-29' }),
    ]);
    const [labeled, unlabeled] = wrapper.findAll('[data-testid="band"]');

    expect(labeled?.attributes('style')).toContain('background-color: #3e63dd');
    expect(unlabeled?.attributes('style')).toContain('background-color: #8b8d98');
  });

  it('opens a task from its row label', async () => {
    const wrapper = mountGrid([task]);
    await wrapper.get('[data-testid="task-row-label"]').trigger('click');

    expect(wrapper.emitted('open')).toEqual([['t1']]);
  });

  it('moves both dates by the number of days dragged', async () => {
    const wrapper = mountGrid([task]);

    await band(wrapper).trigger('pointerdown', pointer(x(1)));
    await grid(wrapper).trigger('pointermove', pointer(x(1) + 80));

    expect(band(wrapper).attributes('style')).toContain('left: 120px');
    expect(band(wrapper).classes()).toContain('dragging');

    await grid(wrapper).trigger('pointerup', pointer(x(1) + 80));

    expect(wrapper.emitted('commit')).toEqual([
      [{ taskId: 't1', startDate: '2026-10-01', endDate: '2026-10-03' }],
    ]);
    expect(wrapper.emitted('open')).toBeUndefined();
    expect(band(wrapper).attributes('style')).toContain('left: 40px');
  });

  it('changes only the end date from the end handle', async () => {
    const wrapper = mountGrid([task]);

    await wrapper.get('[data-testid="handle-end"]').trigger('pointerdown', pointer(x(3, 35)));
    await dragOnGrid(wrapper, x(5, 35));

    expect(wrapper.emitted('commit')).toEqual([
      [{ taskId: 't1', startDate: '2026-09-29', endDate: '2026-10-03' }],
    ]);
  });

  it('clamps the start handle at the end date', async () => {
    const wrapper = mountGrid([task]);

    await wrapper.get('[data-testid="handle-start"]').trigger('pointerdown', pointer(x(1, 5)));
    await dragOnGrid(wrapper, x(9, 5));

    expect(wrapper.emitted('commit')).toEqual([
      [{ taskId: 't1', startDate: '2026-10-01', endDate: '2026-10-01' }],
    ]);
  });

  it('opens the task when the pointer moves less than the threshold', async () => {
    const wrapper = mountGrid([task]);

    await band(wrapper).trigger('pointerdown', pointer(x(1)));
    await dragOnGrid(wrapper, x(1) + 3);

    expect(wrapper.emitted('open')).toEqual([['t1']]);
    expect(wrapper.emitted('commit')).toBeUndefined();
  });

  it('does not commit a drag that lands on the original dates', async () => {
    const wrapper = mountGrid([task]);

    await band(wrapper).trigger('pointerdown', pointer(x(1, 5)));
    await dragOnGrid(wrapper, x(1, 35));

    expect(wrapper.emitted('commit')).toBeUndefined();
    expect(wrapper.emitted('open')).toBeUndefined();
  });

  it('ignores non-primary buttons', async () => {
    const wrapper = mountGrid([task]);

    await band(wrapper).trigger('pointerdown', { ...pointer(x(1)), button: 2 });
    await dragOnGrid(wrapper, x(3));

    expect(wrapper.emitted('commit')).toBeUndefined();
    expect(wrapper.emitted('open')).toBeUndefined();
  });

  it('cancels the drag on pointercancel', async () => {
    const wrapper = mountGrid([task]);

    await band(wrapper).trigger('pointerdown', pointer(x(1)));
    await grid(wrapper).trigger('pointermove', pointer(x(3)));
    await grid(wrapper).trigger('pointercancel', pointer(x(3)));
    await grid(wrapper).trigger('pointerup', pointer(x(3)));

    expect(wrapper.emitted('commit')).toBeUndefined();
    expect(band(wrapper).attributes('style')).toContain('left: 40px');
  });

  it('only opens tasks for read-only users', async () => {
    const wrapper = mountGrid([task], { editable: false });

    expect(wrapper.find('[data-testid="handle-start"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="handle-end"]').exists()).toBe(false);

    await band(wrapper).trigger('pointerdown', pointer(x(1)));
    await grid(wrapper).trigger('pointermove', pointer(x(3)));
    expect(band(wrapper).attributes('style')).toContain('left: 40px');
    await grid(wrapper).trigger('pointerup', pointer(x(3)));

    expect(wrapper.emitted('commit')).toBeUndefined();
    expect(wrapper.emitted('open')).toEqual([['t1']]);
  });

  it('draws bands at their overridden dates', () => {
    const wrapper = mountGrid([task], {
      dateOverrides: { t1: { startDate: '2026-10-02', endDate: '2026-10-02' } },
    });
    const style = band(wrapper).attributes('style') ?? '';

    expect(style).toContain('left: 160px');
    expect(style).toContain('width: 40px');
  });

  it('hatches archived tasks and does not let them be dragged', async () => {
    const wrapper = mountGrid([{ ...task, archivedAt: '2026-09-20T00:00:00.000Z' }]);

    expect(band(wrapper).classes()).toContain('archived');
    expect(wrapper.find('[data-testid="handle-start"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="handle-end"]').exists()).toBe(false);

    await band(wrapper).trigger('pointerdown', pointer(x(1)));
    await dragOnGrid(wrapper, x(3));
    expect(wrapper.emitted('commit')).toBeUndefined();
  });

  it('marks done tasks', () => {
    const wrapper = mountGrid([{ ...task, status: 'done' }]);
    expect(band(wrapper).classes()).toContain('done');
  });

  it('keeps a row without a band for tasks outside the range', () => {
    const wrapper = mountGrid([
      makeTask({ id: 'late', startDate: '2026-10-20', endDate: '2026-10-21' }),
    ]);
    const row = wrapper.get('[data-testid="task-row"][data-task-id="late"]');

    expect(row.find('[data-testid="band"]').exists()).toBe(false);
    expect(row.find('[data-testid="undated"]').exists()).toBe(false);
  });

  it('marks tasks without dates as undated', () => {
    const wrapper = mountGrid([makeTask({ id: 'someday' })]);
    const row = wrapper.get('[data-testid="task-row"][data-task-id="someday"]');

    expect(row.find('[data-testid="band"]').exists()).toBe(false);
    expect(row.get('[data-testid="undated"]').text()).toBe('日付未設定');
  });

  it('squares off and drops the handle on the side that leaves the range', () => {
    const wrapper = mountGrid([
      makeTask({ id: 'early', startDate: '2026-09-25', endDate: '2026-10-02' }),
      makeTask({ id: 'late', startDate: '2026-10-10', endDate: '2026-10-15' }),
    ]);
    const [early, late] = wrapper.findAll('[data-testid="band"]');

    expect(early?.classes()).toContain('clip-start');
    expect(early?.classes()).not.toContain('clip-end');
    expect(early?.find('[data-testid="handle-start"]').exists()).toBe(false);
    expect(early?.find('[data-testid="handle-end"]').exists()).toBe(true);
    expect(early?.attributes('style')).toContain('left: 0px');
    expect(early?.attributes('style')).toContain('width: 200px');

    expect(late?.classes()).toContain('clip-end');
    expect(late?.find('[data-testid="handle-end"]').exists()).toBe(false);
    expect(late?.find('[data-testid="handle-start"]').exists()).toBe(true);
    expect(late?.attributes('style')).toContain('left: 480px');
    expect(late?.attributes('style')).toContain('width: 80px');
  });

  describe('with touch', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('opens the task on a tap released before the long press', async () => {
      const wrapper = mountGrid([task]);

      await band(wrapper).trigger('pointerdown', touch(x(1)));
      vi.advanceTimersByTime(LONG_PRESS_MS - 1);
      await grid(wrapper).trigger('pointerup', touch(x(1)));
      vi.advanceTimersByTime(LONG_PRESS_MS);

      expect(wrapper.emitted('open')).toEqual([['t1']]);
      expect(wrapper.emitted('commit')).toBeUndefined();
      expect(band(wrapper).attributes('style')).toContain('left: 40px');
    });

    it('leaves the gesture to scrolling when the finger moves before the long press', async () => {
      const wrapper = mountGrid([task]);

      await band(wrapper).trigger('pointerdown', touch(x(1)));
      await grid(wrapper).trigger('pointermove', touch(x(1), 40));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      await grid(wrapper).trigger('pointermove', touch(x(3), 40));
      await grid(wrapper).trigger('pointerup', touch(x(3), 40));

      expect(wrapper.emitted('open')).toBeUndefined();
      expect(wrapper.emitted('commit')).toBeUndefined();
      expect(band(wrapper).classes()).not.toContain('dragging');
    });

    it('drags after a long press and commits the new dates', async () => {
      const wrapper = mountGrid([task]);

      await band(wrapper).trigger('pointerdown', touch(x(1)));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      await grid(wrapper).trigger('pointermove', touch(x(3)));

      expect(band(wrapper).classes()).toContain('dragging');

      await grid(wrapper).trigger('pointerup', touch(x(3)));

      expect(wrapper.emitted('commit')).toEqual([
        [{ taskId: 't1', startDate: '2026-10-01', endDate: '2026-10-03' }],
      ]);
      expect(wrapper.emitted('open')).toBeUndefined();
    });

    it('does nothing when released after a long press without moving', async () => {
      const wrapper = mountGrid([task]);

      await band(wrapper).trigger('pointerdown', touch(x(1)));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      await grid(wrapper).trigger('pointerup', touch(x(1)));

      expect(wrapper.emitted('open')).toBeUndefined();
      expect(wrapper.emitted('commit')).toBeUndefined();
    });

    it('blocks touch scrolling only while a long-press drag is active', async () => {
      const wrapper = mountGrid([task]);
      const scroll = () => {
        const event = new Event('touchmove', { cancelable: true });
        grid(wrapper).element.dispatchEvent(event);
        return event.defaultPrevented;
      };

      await band(wrapper).trigger('pointerdown', touch(x(1)));
      expect(scroll()).toBe(false);
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(scroll()).toBe(true);
      await grid(wrapper).trigger('pointerup', touch(x(1)));
      expect(scroll()).toBe(false);
    });
  });
});
