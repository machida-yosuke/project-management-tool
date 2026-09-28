import { createPinia, setActivePinia } from 'pinia';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';
import { alice, json, noContent, setAdapter, stubApi } from '../helpers/api-mock';

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('sets authenticated state when /api/auth/me succeeds', async () => {
    const user = { id: '1', email: 'a@example.com', name: 'A', avatarUrl: null };
    stubApi({ 'GET /api/auth/me': json(user) });

    const store = useAuthStore();
    await store.fetchMe();

    expect(store.status).toBe('authenticated');
    expect(store.user).toEqual(user);
  });

  it('sets unauthenticated state when /api/auth/me returns 401', async () => {
    stubApi({ 'GET /api/auth/me': new Response(null, { status: 401 }) });

    const store = useAuthStore();
    await store.fetchMe();

    expect(store.status).toBe('unauthenticated');
    expect(store.user).toBeNull();
  });

  it('clears user state on logout', async () => {
    const requests = stubApi({ 'POST /api/auth/logout': noContent() });

    const store = useAuthStore();
    store.user = { id: '1', email: 'a@example.com', name: 'A', avatarUrl: null };
    store.status = 'authenticated';

    await store.logout();

    expect(requests).toHaveBeenCalledTimes(1);
    expect(store.status).toBe('unauthenticated');
    expect(store.user).toBeNull();
  });

  it('clears user state on logout even when the request fails', async () => {
    setAdapter(() => Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK)));

    const store = useAuthStore();
    store.user = alice;
    store.status = 'authenticated';

    await store.logout();

    expect(store.status).toBe('unauthenticated');
    expect(store.user).toBeNull();
  });

  it('sets unauthenticated state when the request fails without a response', async () => {
    setAdapter(() => Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK)));

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
    const requests = stubApi({ 'GET /api/auth/me': () => fetchPromise });

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
    expect(store.status).toBe('loading');

    resolveFetch(json(user));
    await first;
    await second;

    expect(requests).toHaveBeenCalledTimes(1);
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
      const requests = stubApi({
        'PATCH /api/me': (body) => json({ ...alice, ...(body as { name: string }) }),
      });
      const store = signedIn();

      await store.updateName('Alicia');

      expect(store.user).toEqual({ ...alice, name: 'Alicia' });
      expect(requests.mock.calls[0]?.[0]).toMatchObject({
        method: 'PATCH',
        body: { name: 'Alicia' },
      });
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
