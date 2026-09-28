import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RouteLocationNormalized } from 'vue-router';
import { requireAuthGuard } from '../../src/router/guards';
import { useAuthStore } from '../../src/stores/auth';
import { json, stubApi } from '../helpers/api-mock';

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

  it('allows navigation when the target route does not require auth', async () => {
    const result = await requireAuthGuard(makeRoute('/login', false), makeRoute('/', true));
    expect(result).toBe(true);
  });

  it('redirects to /login with a redirect query when unauthenticated', async () => {
    stubApi({ 'GET /api/auth/me': new Response(null, { status: 401 }) });

    const result = await requireAuthGuard(makeRoute('/', true), makeRoute('/', true));

    expect(result).toEqual({ path: '/login', query: { redirect: '/' } });
  });

  it('allows navigation when already authenticated', async () => {
    const authStore = useAuthStore();
    authStore.status = 'authenticated';
    authStore.user = { id: '1', email: 'a@example.com', name: 'A', avatarUrl: null };

    const result = await requireAuthGuard(makeRoute('/', true), makeRoute('/', true));

    expect(result).toBe(true);
  });

  it('waits for an in-flight fetchMe instead of redirecting when status is loading', async () => {
    // Regression test: a guard invocation that lands while status === 'loading' (a
    // second, back-to-back navigation racing an in-flight fetchMe() from the first)
    // must await that SAME in-flight request rather than immediately falling through
    // to the `status !== 'authenticated'` check and bouncing an authenticated user
    // to /login.
    const user = { id: '1', email: 'a@example.com', name: 'A', avatarUrl: null };
    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    stubApi({ 'GET /api/auth/me': () => fetchPromise });

    const authStore = useAuthStore();
    // Simulate a first navigation's guard already having kicked off fetchMe().
    const firstFetchMe = authStore.fetchMe();
    expect(authStore.status).toBe('loading');

    // A second, back-to-back navigation's guard invocation runs while still loading.
    const guardResult = requireAuthGuard(makeRoute('/', true), makeRoute('/', true));

    resolveFetch(json(user));
    await firstFetchMe;

    expect(await guardResult).toBe(true);
  });
});
