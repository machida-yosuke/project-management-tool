import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TaskStateBadge from '../../../src/components/task/TaskStateBadge.vue';

describe('TaskStateBadge', () => {
  it('shows an open task in green', () => {
    const badge = mount(TaskStateBadge, { props: { status: 'open' } });
    expect(badge.text()).toBe('未完了');
    expect(badge.classes()).toContain('bg-green-600');
  });

  it('shows a done task in purple', () => {
    const badge = mount(TaskStateBadge, { props: { status: 'done' } });
    expect(badge.text()).toBe('完了');
    expect(badge.classes()).toContain('bg-purple-600');
  });
});
