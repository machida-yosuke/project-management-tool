import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TaskStateBadge from '../../../src/components/task/TaskStateBadge.vue';

describe('TaskStateBadge', () => {
  it('shows an open task in the success color', () => {
    const badge = mount(TaskStateBadge, { props: { status: 'open' } });
    expect(badge.text()).toBe('未完了');
    expect(badge.classes()).toContain('text-success');
  });

  it('shows a done task in the info color', () => {
    const badge = mount(TaskStateBadge, { props: { status: 'done' } });
    expect(badge.text()).toBe('完了');
    expect(badge.classes()).toContain('text-info');
  });
});
