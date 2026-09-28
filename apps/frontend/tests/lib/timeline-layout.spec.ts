import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/lib/dates';
import { visibleSpan, type DatedTask } from '../../src/lib/timeline-layout';

const range = Array.from({ length: 7 }, (_, i) => addDays('2026-09-28', i));

function task(startDate: string, endDate: string): DatedTask {
  return { id: 'a', startDate, endDate };
}

describe('visibleSpan', () => {
  it('places a task inside the range', () => {
    expect(visibleSpan(task('2026-09-29', '2026-10-01'), range)).toEqual({
      startCol: 1,
      span: 3,
      clipStart: false,
      clipEnd: false,
    });
  });

  it('places a one-day task on a single column', () => {
    expect(visibleSpan(task('2026-10-04', '2026-10-04'), range)).toEqual({
      startCol: 6,
      span: 1,
      clipStart: false,
      clipEnd: false,
    });
  });

  it('clips tasks that extend beyond the range', () => {
    expect(visibleSpan(task('2026-09-20', '2026-09-29'), range)).toEqual({
      startCol: 0,
      span: 2,
      clipStart: true,
      clipEnd: false,
    });
    expect(visibleSpan(task('2026-10-03', '2026-10-10'), range)).toEqual({
      startCol: 5,
      span: 2,
      clipStart: false,
      clipEnd: true,
    });
    expect(visibleSpan(task('2026-09-01', '2026-10-31'), range)).toEqual({
      startCol: 0,
      span: 7,
      clipStart: true,
      clipEnd: true,
    });
  });

  it('returns null for tasks outside the range', () => {
    expect(visibleSpan(task('2026-09-20', '2026-09-27'), range)).toBeNull();
    expect(visibleSpan(task('2026-10-05', '2026-10-06'), range)).toBeNull();
    expect(visibleSpan(task('2026-09-28', '2026-09-28'), [])).toBeNull();
  });
});
