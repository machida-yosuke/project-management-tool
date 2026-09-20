import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteLocationNormalized } from 'vue-router';
import { requireAuthGuard } from '../../src/router/guards';
import { useAuthStore } from '../../src/stores/auth';

function makeRoute(path: string, requiresAuth: boolean): RouteLocationNormalized {
  return {
    path,
    fullPath: path,
    meta: { requiresAuth },
  } as RouteLocationNormalized;
}

describe('requireAuthGuard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allows navigation when the target route does not require auth', async () => {
    const result = await requireAuthGuard(makeRoute('/login', false), makeRoute('/', true));
    expect(result).toBe(true);
  });

  it('redirects to /login with a redirect query when unauthenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const result = await requireAuthGuard(makeRoute('/', true), makeRoute('/', true));

    expect(result).toEqual({ path: '/login', query: { redirect: '/' } });
  });

  it('allows navigation when already authenticated', async () => {
    const authStore = useAuthStore();
    authStore.status = 'authenticated';
    authStore.user = { id: '1', email: 'a@example.com', name: 'A' };

    const result = await requireAuthGuard(makeRoute('/', true), makeRoute('/', true));

    expect(result).toBe(true);
  });
});
