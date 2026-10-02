import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RelativeTime from '../../../src/components/task/RelativeTime.vue';

const NOW = new Date('2026-09-28T12:00:00.000Z');

function render(datetime: string) {
  return mount(RelativeTime, { props: { datetime } }).get('time');
}

describe('RelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['2026-09-28T11:59:30.000Z', 'たった今'],
    ['2026-09-28T11:55:00.000Z', '5 分前'],
    ['2026-09-28T09:00:00.000Z', '3 時間前'],
    ['2026-09-26T12:00:00.000Z', '2 日前'],
    ['2026-09-14T12:00:00.000Z', '14 日前'],
    ['2026-06-28T12:00:00.000Z', '3 か月前'],
    ['2024-09-28T12:00:00.000Z', '2 年前'],
  ])('formats %s as %s', (datetime, expected) => {
    expect(render(datetime).text()).toBe(expected);
  });

  it('treats a future timestamp as now', () => {
    expect(render('2026-09-28T12:00:10.000Z').text()).toBe('たった今');
  });

  it('keeps the machine-readable and absolute time', () => {
    const time = render('2026-09-26T12:00:00.000Z');
    expect(time.attributes('datetime')).toBe('2026-09-26T12:00:00.000Z');
    expect(time.attributes('title')).toBe(
      new Date('2026-09-26T12:00:00.000Z').toLocaleString('ja-JP'),
    );
  });
});
