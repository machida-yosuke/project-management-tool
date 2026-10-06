import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from '../../src/lib/relative-time';

const NOW = new Date('2026-09-28T12:00:00.000Z');

describe('formatRelativeTime', () => {
  it('shows "たった今" within a minute, including slightly future timestamps', () => {
    expect(formatRelativeTime('2026-09-28T11:59:30.000Z', NOW)).toBe('たった今');
    expect(formatRelativeTime('2026-09-28T12:00:10.000Z', NOW)).toBe('たった今');
  });

  it('uses the largest whole unit', () => {
    expect(formatRelativeTime('2026-09-28T11:55:00.000Z', NOW)).toBe('5 分前');
    expect(formatRelativeTime('2026-09-28T09:30:00.000Z', NOW)).toBe('2 時間前');
    expect(formatRelativeTime('2026-09-25T12:00:00.000Z', NOW)).toBe('3 日前');
    expect(formatRelativeTime('2026-07-28T12:00:00.000Z', NOW)).toBe('2 か月前');
    expect(formatRelativeTime('2024-09-01T12:00:00.000Z', NOW)).toBe('2 年前');
  });

  it('floors partial units', () => {
    expect(formatRelativeTime('2026-09-27T11:00:00.000Z', NOW)).toBe('1 日前');
    expect(formatRelativeTime('2026-09-27T13:00:00.000Z', NOW)).toBe('23 時間前');
  });
});
