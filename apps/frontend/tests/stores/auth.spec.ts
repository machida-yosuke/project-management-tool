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

  it('reuses the in-flight promise when fetchMe is called again before the first resolves', async () => {
    const user = { id: '1', email: 'a@example.com', name: 'A' };
    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal('fetch', fetchMock);

    const store = useAuthStore();
    const first = store.fetchMe();
    // Note: Pinia wraps action return values in a fresh `.then()`-derived promise
    // (see `wrapAction`), so the two *call-site* return values are never `===` even
    // when they're backed by the same request. What must be identical is the
    // underlying in-flight promise tracked on state.
    const promiseAfterFirstCall = store.fetchMePromise;
    const second = store.fetchMe();
    const promiseAfterSecondCall = store.fetchMePromise;

    expect(promiseAfterSecondCall).toBe(promiseAfterFirstCall);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.status).toBe('loading');

    resolveFetch(new Response(JSON.stringify(user), { status: 200 }));
    await first;
    await second;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.status).toBe('authenticated');
    expect(store.user).toEqual(user);
    expect(store.fetchMePromise).toBeNull();
  });
});
