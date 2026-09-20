import { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { router } from '../src/router';
import App from '../src/App.vue';
import { useAuthStore } from '../src/stores/auth';

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the app title', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await router.push('/login');
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } });

    expect(wrapper.text()).toContain('Project Management Tool');
  });

  it('shows the user name and a logout button when authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await router.push('/login');
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia, router] } });

    const authStore = useAuthStore(pinia);
    authStore.status = 'authenticated';
    authStore.user = { id: '1', email: 'a@example.com', name: 'Test User' };
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Test User');
    expect(wrapper.find('button').exists()).toBe(true);
  });
});
