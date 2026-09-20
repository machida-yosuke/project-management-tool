import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { router } from '../src/router';
import App from '../src/App.vue';

describe('App', () => {
  it('renders the app title', async () => {
    await router.push('/');
    const wrapper = mount(App, { global: { plugins: [router] } });

    expect(wrapper.text()).toContain('Project Management Tool');
  });
});
