import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { Env } from '../env';
import { getSessionUser, type SessionUser } from '../auth/session';

export interface AuthEnv {
  Bindings: Env;
  Variables: { user: SessionUser };
}

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const user = await getSessionUser(c.env.SESSIONS, getCookie(c, 'session_id'));
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  c.set('user', user);
  await next();
});
