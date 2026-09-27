import type { ApiError } from '@pm-tool/shared';
import { useAuthStore } from '../stores/auth';

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'https://localhost:8787';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly error: string;
  readonly details: unknown;

  constructor(status: number, body: ApiError, details: unknown = null) {
    super(`API request failed with ${status}: ${body.error}`);
    this.name = 'ApiRequestError';
    this.status = status;
    this.error = body.error;
    this.details = details;
  }
}

export type ApiFetchInit = Omit<RequestInit, 'body' | 'credentials'> & { body?: unknown };

async function readErrorBody(res: Response): Promise<{ body: ApiError; details: unknown }> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof parsed.error === 'string'
    ) {
      return { body: { error: parsed.error }, details: parsed };
    }
  } catch (e) {
    // Non-JSON error bodies (e.g. proxy HTML pages) fall through to a generic code.
    if (!(e instanceof SyntaxError)) throw e;
  }
  return { body: { error: 'unknown_error' }, details: null };
}

function encodeBody(body: unknown, headers: Headers) {
  if (body === undefined) return undefined;
  // The browser sets the multipart boundary itself, so no Content-Type here.
  if (body instanceof FormData) return body;
  headers.set('Content-Type', 'application/json');
  return JSON.stringify(body);
}

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { body, headers, ...rest } = init;
  const requestHeaders = new Headers(headers);

  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...rest,
    headers: requestHeaders,
    credentials: 'include',
    body: encodeBody(body, requestHeaders),
  });

  if (!res.ok) {
    if (res.status === 401) {
      const authStore = useAuthStore();
      authStore.user = null;
      authStore.status = 'unauthenticated';
    }
    const { body: errorBody, details } = await readErrorBody(res);
    throw new ApiRequestError(res.status, errorBody, details);
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
