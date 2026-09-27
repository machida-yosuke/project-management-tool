import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { Env } from '../env';
import { destroySession, getSessionUser } from '../auth/session';
import { findActiveUserById, type AuthUser } from '../auth/users';

export interface AuthEnv {
  Bindings: Env;
  Variables: { user: AuthUser };
}

// The KV session only identifies the user; D1 is read on every request so renames apply
// immediately and a deleted account's remaining sessions stop working.
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const sessionId = getCookie(c, 'session_id');
  const session = await getSessionUser(c.env.SESSIONS, sessionId);
  if (!session) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const user = await findActiveUserById(c.env.DB, session.id);
  if (!user) {
    await destroySession(c.env.SESSIONS, sessionId);
    return c.json({ error: 'unauthorized' }, 401);
  }
  c.set('user', user);
  await next();
});
