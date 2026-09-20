import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/stores/auth';

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets authenticated state when /api/auth/me succeeds', async () => {
    const user = { id: '1', email: 'a@example.com', name: 'A' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(user), { status: 200 })),
    );

    const store = useAuthStore();
    await store.fetchMe();

    expect(store.status).toBe('authenticated');
    expect(store.user).toEqual(user);
  });

  it('sets unauthenticated state when /api/auth/me returns 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const store = useAuthStore();
    await store.fetchMe();

    expect(store.status).toBe('unauthenticated');
    expect(store.user).toBeNull();
  });

  it('clears user state on logout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const store = useAuthStore();
    store.user = { id: '1', email: 'a@example.com', name: 'A' };
    store.status = 'authenticated';

    await store.logout();

    expect(store.status).toBe('unauthenticated');
    expect(store.user).toBeNull();
  });

  it('sets unauthenticated state when fetch itself throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const store = useAuthStore();
    await store.fetchMe();

    expect(store.status).toBe('unauthenticated');
    expect(store.user).toBeNull();
  });
});
