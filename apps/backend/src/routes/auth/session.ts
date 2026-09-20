import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import type { Env } from '../../env';
import { destroySession, getSessionUser } from '../../auth/session';

export const authSessionRoute = new Hono<{ Bindings: Env }>();

authSessionRoute.get('/me', async (c) => {
  const sessionId = getCookie(c, 'session_id');
  const user = await getSessionUser(c.env.SESSIONS, sessionId);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  return c.json(user);
});

authSessionRoute.post('/logout', async (c) => {
  const sessionId = getCookie(c, 'session_id');
  await destroySession(c.env.SESSIONS, sessionId);
  deleteCookie(c, 'session_id', {
    path: '/',
    sameSite: 'Lax',
    secure: c.env.APP_ENV === 'production',
  });
  return c.body(null, 204);
});
