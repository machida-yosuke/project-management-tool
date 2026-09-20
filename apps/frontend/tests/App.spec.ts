import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { router } from '../src/router';
import App from '../src/App.vue';

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the app title', async () => {
    // '/' now requires auth (Task 10), so the router guard calls the auth store during
    // router.push below — an active Pinia instance must exist before that happens,
    // mirroring main.ts's `app.use(createPinia())`.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const pinia = createPinia();
    setActivePinia(pinia);

    await router.push('/');
    const wrapper = mount(App, { global: { plugins: [pinia, router] } });

    expect(wrapper.text()).toContain('Project Management Tool');
  });
});
