import { Hono } from 'hono';
import type { HealthCheckResponse } from '@pm-tool/shared';
import type { Env } from '../env';

export const healthRoute = new Hono<{ Bindings: Env }>().get('/', (c) => {
  const body: HealthCheckResponse = { status: 'ok' };
  return c.json(body);
});
