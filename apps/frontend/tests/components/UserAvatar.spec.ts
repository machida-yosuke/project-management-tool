import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UserAvatar from '../../src/components/UserAvatar.vue';
import { API_BASE } from '../helpers/api-mock';

describe('UserAvatar', () => {
  it('renders the avatar image from the API base URL', () => {
    const wrapper = mount(UserAvatar, {
      props: { name: 'Alice', avatarUrl: '/api/avatars/u-alice/f1', size: 32 },
    });

    const img = wrapper.get('img');
    expect(img.attributes('src')).toBe(`${API_BASE}/api/avatars/u-alice/f1`);
    expect(img.attributes('alt')).toBe('Alice');
    expect(img.attributes('style')).toContain('width: 32px');
  });

  it('falls back to the initial when there is no avatar', () => {
    const wrapper = mount(UserAvatar, { props: { name: 'bob', avatarUrl: null } });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toBe('B');
    expect(wrapper.attributes('style')).toContain('width: 24px');
  });
});
