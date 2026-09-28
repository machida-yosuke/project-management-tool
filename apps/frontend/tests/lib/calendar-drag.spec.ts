import { describe, expect, it } from 'vitest';
import {
  computeDragDates,
  dateAtX,
  exceedsThreshold,
  measureDayCells,
  type DayCellRect,
} from '../../src/lib/calendar-drag';

const base = { originalStart: '2026-09-29', originalEnd: '2026-10-01' };

describe('computeDragDates', () => {
  it('moves both dates by the same number of days', () => {
    expect(
      computeDragDates({
        ...base,
        mode: 'move',
        anchorDate: '2026-09-30',
        currentDate: '2026-10-03',
      }),
    ).toEqual({ startDate: '2026-10-02', endDate: '2026-10-04' });
  });

  it('changes only the start date and never passes the end date', () => {
    expect(
      computeDragDates({
        ...base,
        mode: 'start',
        anchorDate: '2026-09-29',
        currentDate: '2026-09-27',
      }),
    ).toEqual({ startDate: '2026-09-27', endDate: '2026-10-01' });
    expect(
      computeDragDates({
        ...base,
        mode: 'start',
        anchorDate: '2026-09-29',
        currentDate: '2026-10-05',
      }),
    ).toEqual({ startDate: '2026-10-01', endDate: '2026-10-01' });
  });

  it('changes only the end date and never passes the start date', () => {
    expect(
      computeDragDates({
        ...base,
        mode: 'end',
        anchorDate: '2026-10-01',
        currentDate: '2026-10-04',
      }),
    ).toEqual({ startDate: '2026-09-29', endDate: '2026-10-04' });
    expect(
      computeDragDates({
        ...base,
        mode: 'end',
        anchorDate: '2026-10-01',
        currentDate: '2026-09-20',
      }),
    ).toEqual({ startDate: '2026-09-29', endDate: '2026-09-29' });
  });
});

describe('dateAtX', () => {
  const cells: DayCellRect[] = [
    { date: '2026-09-28', rect: { left: 0, right: 40 } },
    { date: '2026-09-29', rect: { left: 40, right: 80 } },
  ];

  it('returns the date of the column under the x coordinate', () => {
    expect(dateAtX(cells, 20)).toBe('2026-09-28');
    expect(dateAtX(cells, 40)).toBe('2026-09-29');
    expect(dateAtX(cells, 79)).toBe('2026-09-29');
  });

  it('returns null outside every column', () => {
    expect(dateAtX(cells, 80)).toBeNull();
    expect(dateAtX(cells, -1)).toBeNull();
    expect(dateAtX([], 0)).toBeNull();
  });
});

describe('exceedsThreshold', () => {
  it('treats moves under 4px as a click', () => {
    expect(exceedsThreshold({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
    expect(exceedsThreshold({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
    expect(exceedsThreshold({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    expect(exceedsThreshold({ x: 10, y: 10 }, { x: 10, y: 5 })).toBe(true);
  });
});

describe('measureDayCells', () => {
  function fakeElement(date: string | null, left: number) {
    return {
      getAttribute: (name: string) => (name === 'data-date' ? date : null),
      getBoundingClientRect: () => ({ left, top: 10, right: left + 50, bottom: 60 }),
    };
  }

  it('reads the date and rect of every [data-date] element', () => {
    const elements = [fakeElement('2026-09-28', 0), fakeElement('2026-09-29', 50)];
    const root = {
      querySelectorAll: (selector: string) => (selector === '[data-date]' ? elements : []),
    } as unknown as Element;

    expect(measureDayCells(root)).toEqual([
      { date: '2026-09-28', rect: { left: 0, right: 50 } },
      { date: '2026-09-29', rect: { left: 50, right: 100 } },
    ]);
  });

  it('returns nothing without a root', () => {
    expect(measureDayCells(null)).toEqual([]);
  });
});
