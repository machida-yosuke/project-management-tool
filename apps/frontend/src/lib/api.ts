import type { ApiError } from '@pm-tool/shared';
import { useAuthStore } from '../stores/auth';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'https://localhost:8787';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly error: string;

  constructor(status: number, body: ApiError) {
    super(`API request failed with ${status}: ${body.error}`);
    this.name = 'ApiRequestError';
    this.status = status;
    this.error = body.error;
  }
}

export type ApiFetchInit = Omit<RequestInit, 'body' | 'credentials'> & { body?: unknown };

async function readErrorBody(res: Response): Promise<ApiError> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as Partial<ApiError> | null;
    if (parsed && typeof parsed.error === 'string') {
      return { error: parsed.error };
    }
  } catch (e) {
    // Non-JSON error bodies (e.g. proxy HTML pages) fall through to a generic code.
    if (!(e instanceof SyntaxError)) throw e;
  }
  return { error: 'unknown_error' };
}

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { body, headers, ...rest } = init;
  const requestHeaders = new Headers(headers);
  if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...rest,
    headers: requestHeaders,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 401) {
      const authStore = useAuthStore();
      authStore.user = null;
      authStore.status = 'unauthenticated';
    }
    throw new ApiRequestError(res.status, await readErrorBody(res));
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export function errorMessage(
  e: unknown,
  messages: Partial<Record<string, string>>,
  fallback: string,
): string {
  if (e instanceof ApiRequestError) {
    return messages[e.error] ?? fallback;
  }
  return fallback;
}
