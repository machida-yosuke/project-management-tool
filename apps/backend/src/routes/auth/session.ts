import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import { destroySession } from '../../auth/session';
import { requireAuth, type AuthEnv } from '../../middleware/require-auth';

export const authSessionRoute = new Hono<AuthEnv>();

authSessionRoute.get('/me', requireAuth, (c) => c.json(c.get('user')));

authSessionRoute.post('/logout', async (c) => {
  const sessionId = getCookie(c, 'session_id');
  await destroySession(c.env.SESSIONS, sessionId);
  deleteCookie(c, 'session_id', {
    path: '/',
    sameSite: 'Lax',
    secure: true,
  });
  return c.body(null, 204);
});
