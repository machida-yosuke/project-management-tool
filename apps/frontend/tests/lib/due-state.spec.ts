import { describe, expect, it } from 'vitest';
import { dueState } from '../../src/lib/due-state';

const TODAY = '2026-09-28';

describe('dueState', () => {
  it('is overdue when the due date is before today', () => {
    expect(dueState('2026-09-27', 'open', TODAY)).toBe('overdue');
    expect(dueState('2025-12-31', 'open', TODAY)).toBe('overdue');
  });

  it('is soon from today through two days later', () => {
    expect(dueState('2026-09-28', 'open', TODAY)).toBe('soon');
    expect(dueState('2026-09-29', 'open', TODAY)).toBe('soon');
    expect(dueState('2026-09-30', 'open', TODAY)).toBe('soon');
  });

  it('is normal three or more days ahead', () => {
    expect(dueState('2026-10-01', 'open', TODAY)).toBe('normal');
    expect(dueState('2027-01-01', 'open', TODAY)).toBe('normal');
  });

  it('counts across month boundaries by calendar day', () => {
    expect(dueState('2026-10-01', 'open', '2026-09-29')).toBe('soon');
    expect(dueState('2026-09-30', 'open', '2026-10-01')).toBe('overdue');
  });

  it('is always normal for done tasks', () => {
    expect(dueState('2026-09-27', 'done', TODAY)).toBe('normal');
    expect(dueState('2026-09-28', 'done', TODAY)).toBe('normal');
  });

  it('is normal without a due date', () => {
    expect(dueState(null, 'open', TODAY)).toBe('normal');
  });
});
