import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiError } from '@pm-tool/shared';
// Circular (api.ts -> stores/auth -> generated -> api.ts): only reference imports inside function bodies here.
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

function parseErrorBody(parsed: unknown): { body: ApiError; details: unknown } {
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'error' in parsed &&
    typeof parsed.error === 'string'
  ) {
    return { body: { error: parsed.error }, details: parsed };
  }
  return { body: { error: 'unknown_error' }, details: null };
}

function markUnauthenticated() {
  const authStore = useAuthStore();
  authStore.user = null;
  authStore.status = 'unauthenticated';
}

export const axiosInstance = axios.create({ baseURL: apiBaseUrl, withCredentials: true });

axiosInstance.interceptors.response.use(undefined, (error: unknown) => {
  if (!(error instanceof AxiosError) || !error.response) {
    throw error;
  }
  const { status, data } = error.response;
  if (status === 401) {
    markUnauthenticated();
  }
  // axios leaves non-JSON bodies (e.g. proxy HTML pages) as strings, which map to a generic code.
  const { body, details } = parseErrorBody(data);
  throw new ApiRequestError(status, body, details);
});

export async function customInstance<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> {
  const res = await axiosInstance<T>({ ...config, ...options });
  if (res.status === 204) {
    return undefined as T;
  }
  return res.data;
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
