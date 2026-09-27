import type { Env } from 'hono';
import type { Hook } from '@hono/zod-validator';

export const onValidationError: Hook<unknown, Env, string> = (result, c) => {
  if (!result.success) {
    return c.json({ error: 'validation_error', issues: result.error.issues }, 400);
  }
};
