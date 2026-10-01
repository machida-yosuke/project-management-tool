import { createPinia } from 'pinia';
import { PiniaColada } from '@pinia/colada';
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { router } from '../src/router';
import App from '../src/App.vue';
import { useAuthStore } from '../src/stores/auth';
import { stubApi } from './helpers/api-mock';

describe('App', () => {
  it('renders the app logo', async () => {
    stubApi({ 'GET /api/auth/me': new Response(null, { status: 401 }) });
    await router.push('/login');
    const wrapper = mount(App, { global: { plugins: [createPinia(), PiniaColada, router] } });

    expect(wrapper.find('a[aria-label="Cadence"] svg').exists()).toBe(true);
  });

  it('shows a user menu with settings and logout when authenticated', async () => {
    stubApi({ 'GET /api/auth/me': new Response(null, { status: 401 }) });
    await router.push('/login');
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia, PiniaColada, router] } });

    // Let the initial fetchMe settle first so its 401 does not overwrite the state set below.
    await flushPromises();
    const authStore = useAuthStore(pinia);
    authStore.status = 'authenticated';
    authStore.user = { id: '1', email: 'a@example.com', name: 'Test User', avatarUrl: null };
    await wrapper.vm.$nextTick();

    const trigger = wrapper.get('[data-testid="user-menu"]');
    expect(trigger.text()).toContain('Test User');

    // Reka UI teleports the menu to <body>, outside the mounted wrapper.
    await trigger.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
    expect(items.map((item) => item.textContent?.trim())).toEqual(['設定', 'ログアウト']);
    expect(document.querySelector('a[href="/settings"]')?.textContent?.trim()).toBe('設定');
    wrapper.unmount();
  });

  it('logs out from the user menu', async () => {
    const requests = stubApi({
      'GET /api/auth/me': new Response(null, { status: 401 }),
      'POST /api/auth/logout': new Response(null, { status: 204 }),
    });
    await router.push('/login');
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia, PiniaColada, router] } });

    // Let the initial fetchMe settle first so its 401 does not overwrite the state set below.
    await flushPromises();
    const authStore = useAuthStore(pinia);
    authStore.status = 'authenticated';
    authStore.user = { id: '1', email: 'a@example.com', name: 'Test User', avatarUrl: null };
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-testid="user-menu"]').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    const logout = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent?.trim() === 'ログアウト',
    );
    if (!logout) throw new Error('Logout menu item not found');
    logout.click();
    await flushPromises();

    expect(requests.mock.calls.map(([req]) => `${req.method} ${req.path}`)).toContain(
      'POST /api/auth/logout',
    );
    expect(authStore.status).toBe('unauthenticated');
    expect(wrapper.find('[data-testid="user-menu"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('uses the max-w-screen-2xl main container on every route', async () => {
    stubApi({ 'GET /api/auth/me': new Response(null, { status: 401 }) });
    await router.push('/login');
    const wrapper = mount(App, { global: { plugins: [createPinia(), PiniaColada, router] } });

    expect(wrapper.get('main').classes()).toContain('max-w-screen-2xl');
  });
});
