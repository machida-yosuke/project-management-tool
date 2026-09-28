import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  addMonths,
  diffDays,
  formatMonthLabel,
  formatShortDay,
  formatWeekRangeLabel,
  fromDayNumber,
  isDateString,
  isSameMonth,
  mondayIndex,
  monthDays,
  startOfWeek,
  toDayNumber,
  todayString,
  weekOf,
} from '../../src/lib/dates';

describe('dates', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips day numbers', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(fromDayNumber(toDayNumber('2026-09-28'))).toBe('2026-09-28');
  });

  it('validates date strings including out-of-range days', () => {
    expect(isDateString('2026-09-28')).toBe(true);
    expect(isDateString('2028-02-29')).toBe(true);
    expect(isDateString('2026-02-29')).toBe(false);
    expect(isDateString('2026-9-28')).toBe(false);
    expect(isDateString('nope')).toBe(false);
  });

  it('adds days across leap days and year boundaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('diffs days from the first argument to the second', () => {
    expect(diffDays('2026-09-28', '2026-10-04')).toBe(6);
    expect(diffDays('2026-10-04', '2026-09-28')).toBe(-6);
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('indexes weekdays from Monday', () => {
    expect(mondayIndex('2026-09-28')).toBe(0);
    expect(mondayIndex('2026-10-04')).toBe(6);
  });

  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-09-27')).toBe('2026-09-21');
    expect(startOfWeek('2026-09-28')).toBe('2026-09-28');
    expect(weekOf('2026-10-01')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('lists every day of a month', () => {
    const september = monthDays(2026, 9);
    expect(september).toHaveLength(30);
    expect(september[0]).toBe('2026-09-01');
    expect(september.at(-1)).toBe('2026-09-30');

    expect(monthDays(2024, 2)).toHaveLength(29);
    expect(monthDays(2026, 2)).toHaveLength(28);
  });

  it('adds months and clamps to the end of the month', () => {
    expect(addMonths('2026-09-15', 1)).toBe('2026-10-15');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-10', 1)).toBe('2027-01-10');
    expect(addMonths('2026-01-10', -1)).toBe('2025-12-10');
  });

  it('checks month membership', () => {
    expect(isSameMonth('2026-09-30', 2026, 9)).toBe(true);
    expect(isSameMonth('2026-10-01', 2026, 9)).toBe(false);
  });

  it('formats labels', () => {
    expect(formatMonthLabel('2026-09-15')).toBe('2026年9月');
    expect(formatWeekRangeLabel('2026-09-28')).toBe('2026年9月28日〜10月4日');
    expect(formatWeekRangeLabel('2026-09-07')).toBe('2026年9月7日〜9月13日');
    expect(formatWeekRangeLabel('2026-12-28')).toBe('2026年12月28日〜2027年1月3日');
    expect(formatShortDay('2026-09-28')).toBe('9/28');
  });

  it('returns the local date for today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 28, 23, 30));
    expect(todayString()).toBe('2026-09-28');
  });
});
