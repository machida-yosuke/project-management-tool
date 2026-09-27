import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, apiFetch } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';
import { json, noContent } from '../helpers/api-mock';

describe('apiFetch', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends JSON with credentials to the API base URL and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: 'p1' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ id: string }>('/api/projects', {
      method: 'POST',
      body: { name: 'X' },
    });

    expect(result).toEqual({ id: 'p1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://localhost:8787/api/projects');
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'X' }));
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('does not set a Content-Type header when there is no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json([]));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/projects');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('returns undefined for 204 responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(noContent()));

    await expect(apiFetch('/api/projects/p1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('throws ApiRequestError with status and error code for non-2xx responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'forbidden' }, 403)));

    const error = await apiFetch('/api/projects/p1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 403, error: 'forbidden' });
  });

  it('uses a generic error code when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 502 })));

    await expect(apiFetch('/api/projects')).rejects.toMatchObject({
      status: 502,
      error: 'unknown_error',
    });
  });

  it('marks the auth store unauthenticated on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'unauthorized' }, 401)));
    const authStore = useAuthStore();
    authStore.status = 'authenticated';
    authStore.user = { id: '1', email: 'a@example.com', name: 'A' };

    await expect(apiFetch('/api/projects')).rejects.toMatchObject({ status: 401 });

    expect(authStore.status).toBe('unauthenticated');
    expect(authStore.user).toBeNull();
  });

  it('leaves the auth store alone on other errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'forbidden' }, 403)));
    const authStore = useAuthStore();
    authStore.status = 'authenticated';

    await expect(apiFetch('/api/projects')).rejects.toBeInstanceOf(ApiRequestError);

    expect(authStore.status).toBe('authenticated');
  });
});
