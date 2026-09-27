import { hc } from 'hono/client';
import type { AppType } from 'backend';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'https://localhost:8787';

export const apiClient = hc<AppType>(apiBaseUrl);
