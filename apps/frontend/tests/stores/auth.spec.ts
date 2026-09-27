import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';
import { alice, json, noContent, stubApi } from '../helpers/api-mock';

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets authenticated state when /api/auth/me succeeds', async () => {
    const user = { id: '1', email: 'a@example.com', name: 'A', avatarUrl: null };
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
    store.user = { id: '1', email: 'a@example.com', name: 'A', avatarUrl: null };
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
    const user = { id: '1', email: 'a@example.com', name: 'A', avatarUrl: null };
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

  describe('account actions', () => {
    function signedIn() {
      const store = useAuthStore();
      store.user = alice;
      store.status = 'authenticated';
      return store;
    }

    it('updates the name', async () => {
      const fetchMock = stubApi({
        'PATCH /api/me': (body) => json({ ...alice, ...(body as { name: string }) }),
      });
      const store = signedIn();

      await store.updateName('Alicia');

      expect(store.user).toEqual({ ...alice, name: 'Alicia' });
      const [, init] = fetchMock.mock.calls[0] ?? [];
      expect(init?.method).toBe('PATCH');
    });

    it('uploads an avatar as multipart form data under "file"', async () => {
      const withAvatar = { ...alice, avatarUrl: '/api/avatars/u-alice/f1' };
      let sent: unknown = null;
      stubApi({
        'PUT /api/me/avatar': (body) => {
          sent = body;
          return json(withAvatar);
        },
      });
      const store = signedIn();
      const file = new File(['png'], 'me.png', { type: 'image/png' });

      await store.uploadAvatar(file);

      expect(sent).toBeInstanceOf(FormData);
      expect((sent as FormData).get('file')).toBeInstanceOf(File);
      expect(store.user).toEqual(withAvatar);
    });

    it('removes the avatar', async () => {
      stubApi({ 'DELETE /api/me/avatar': json(alice) });
      const store = signedIn();
      store.user = { ...alice, avatarUrl: '/api/avatars/u-alice/f1' };

      await store.removeAvatar();

      expect(store.user).toEqual(alice);
    });

    it('clears the session state after deleting the account', async () => {
      stubApi({ 'DELETE /api/me': noContent() });
      const store = signedIn();

      await store.deleteAccount();

      expect(store.user).toBeNull();
      expect(store.status).toBe('unauthenticated');
    });

    it('keeps the session and rethrows when deletion is blocked', async () => {
      const blocked = { error: 'owned_projects_have_members', projects: [{ id: 'p1', name: 'P' }] };
      stubApi({ 'DELETE /api/me': json(blocked, 409) });
      const store = signedIn();

      const error = await store.deleteAccount().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error).toMatchObject({ status: 409, details: blocked });
      expect(store.user).toEqual(alice);
      expect(store.status).toBe('authenticated');
    });
  });
});
