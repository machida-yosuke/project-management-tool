import { createPinia } from 'pinia';
import { PiniaColada } from '@pinia/colada';
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { router } from '../src/router';
import App from '../src/App.vue';
import { useAuthStore } from '../src/stores/auth';
import { stubApi } from './helpers/api-mock';

describe('App', () => {
  it('renders the app title', async () => {
    stubApi({ 'GET /api/auth/me': new Response(null, { status: 401 }) });
    await router.push('/login');
    const wrapper = mount(App, { global: { plugins: [createPinia(), PiniaColada, router] } });

    expect(wrapper.text()).toContain('Project Management Tool');
  });

  it('shows the user name and a logout button when authenticated', async () => {
    stubApi({ 'GET /api/auth/me': new Response(null, { status: 401 }) });
    await router.push('/login');
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia, PiniaColada, router] } });

    const authStore = useAuthStore(pinia);
    authStore.status = 'authenticated';
    authStore.user = { id: '1', email: 'a@example.com', name: 'Test User', avatarUrl: null };
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Test User');
    expect(wrapper.find('button').exists()).toBe(true);
    expect(wrapper.get('a[href="/settings"]').text()).toBe('設定');
  });
});
