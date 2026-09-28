import { createPinia, setActivePinia } from 'pinia';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiRequestError, axiosInstance, customInstance } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';
import { json, noContent, setAdapter, stubApi } from '../helpers/api-mock';

function captureConfigs() {
  const inner = axiosInstance.defaults.adapter as AxiosAdapter;
  const configs: InternalAxiosRequestConfig[] = [];
  setAdapter((config) => {
    configs.push(config);
    return inner(config);
  });
  return configs;
}

describe('customInstance', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('sends JSON bodies and returns the parsed response body', async () => {
    const requests = stubApi({ 'POST /api/projects': json({ id: 'p1' }, 201) });
    const configs = captureConfigs();

    const result = await customInstance<{ id: string }>({
      url: '/api/projects',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'X' },
    });

    expect(result).toEqual({ id: 'p1' });
    expect(requests.mock.calls[0]?.[0]).toEqual({
      method: 'POST',
      path: '/api/projects',
      body: { name: 'X' },
    });
    expect(configs[0]?.headers.get('Content-Type')).toBe('application/json');
  });

  it('targets the API base URL with credentials', async () => {
    stubApi({ 'GET /api/projects': json([]) });
    const configs = captureConfigs();

    await customInstance({ url: '/api/projects', method: 'GET' });

    expect(configs[0]?.baseURL).toBe('https://localhost:8787');
    expect(configs[0]?.withCredentials).toBe(true);
  });

  it('merges per-call options into the request config', async () => {
    stubApi({ 'GET /api/projects': json([]) });
    const configs = captureConfigs();
    const controller = new AbortController();

    await customInstance({ url: '/api/projects', method: 'GET' }, { signal: controller.signal });

    expect(configs[0]?.signal).toBe(controller.signal);
  });

  it('passes FormData bodies through untouched', async () => {
    const requests = stubApi({ 'PUT /api/me/avatar': json({}) });
    const form = new FormData();
    form.append('file', new File(['x'], 'x.png', { type: 'image/png' }));

    await customInstance({
      url: '/api/me/avatar',
      method: 'PUT',
      headers: { 'Content-Type': 'multipart/form-data' },
      data: form,
    });

    expect(requests.mock.calls[0]?.[0].body).toBe(form);
  });

  it('returns undefined for 204 responses', async () => {
    stubApi({ 'DELETE /api/projects/p1': noContent() });

    await expect(
      customInstance({ url: '/api/projects/p1', method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });
});

describe('axiosInstance error interceptor', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('throws ApiRequestError with status and error code for non-2xx responses', async () => {
    stubApi({ 'GET /api/projects/p1': json({ error: 'forbidden' }, 403) });

    const error = await customInstance({ url: '/api/projects/p1', method: 'GET' }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 403, error: 'forbidden' });
  });

  it('exposes the parsed error body as details', async () => {
    const body = { error: 'owned_projects_have_members', projects: [{ id: 'p1', name: 'P' }] };
    stubApi({ 'DELETE /api/me': json(body, 409) });

    await expect(customInstance({ url: '/api/me', method: 'DELETE' })).rejects.toMatchObject({
      status: 409,
      error: 'owned_projects_have_members',
      details: body,
    });
  });

  it('uses a generic error code when the error body is not JSON', async () => {
    stubApi({ 'GET /api/projects': new Response('<html>', { status: 502 }) });

    await expect(customInstance({ url: '/api/projects', method: 'GET' })).rejects.toMatchObject({
      status: 502,
      error: 'unknown_error',
      details: null,
    });
  });

  it('marks the auth store unauthenticated on 401', async () => {
    stubApi({ 'GET /api/projects': json({ error: 'unauthorized' }, 401) });
    const authStore = useAuthStore();
    authStore.status = 'authenticated';
    authStore.user = { id: '1', email: 'a@example.com', name: 'A', avatarUrl: null };

    await expect(customInstance({ url: '/api/projects', method: 'GET' })).rejects.toMatchObject({
      status: 401,
    });

    expect(authStore.status).toBe('unauthenticated');
    expect(authStore.user).toBeNull();
  });

  it('leaves the auth store alone on other errors', async () => {
    stubApi({ 'GET /api/projects': json({ error: 'forbidden' }, 403) });
    const authStore = useAuthStore();
    authStore.status = 'authenticated';

    await expect(customInstance({ url: '/api/projects', method: 'GET' })).rejects.toBeInstanceOf(
      ApiRequestError,
    );

    expect(authStore.status).toBe('authenticated');
  });

  it('rethrows errors without an HTTP response as-is', async () => {
    const networkError = new AxiosError('Network Error', AxiosError.ERR_NETWORK);
    setAdapter(() => Promise.reject(networkError));
    const authStore = useAuthStore();
    authStore.status = 'authenticated';

    await expect(customInstance({ url: '/api/projects', method: 'GET' })).rejects.toBe(
      networkError,
    );

    expect(authStore.status).toBe('authenticated');
  });
});
