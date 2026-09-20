import { Hono } from 'hono';
import { googleAuth } from '@hono/oauth-providers/google';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { validateRedirectPath } from '@pm-tool/shared';
import type { Env } from '../../env';
import { upsertUserByEmail } from '../../auth/users';
import { createSession } from '../../auth/session';

export const googleAuthRoute = new Hono<{ Bindings: Env }>();

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

// This single route handles both directions of the OAuth handshake:
// - No `code` query param: the browser is arriving fresh. The middleware
//   below stores the post-login redirect target, then googleAuth() sets its
//   own `state` cookie and short-circuits with a redirect to Google's
//   consent screen (it does NOT call next() in this case).
// - `code` present: Google is calling back. googleAuth() verifies `state`,
//   exchanges the code, populates `c.get('user-google')`, and calls next(),
//   so the final handler below runs.
// Cookies set by earlier middleware in this chain (like oauth_redirect)
// survive into googleAuth()'s short-circuited redirect response because
// Hono's Context is a single shared/mutated object across the whole chain,
// not an independent response per middleware.
googleAuthRoute.get(
  '/',
  async (c, next) => {
    // Only the initial hit (no `code` yet) should set/refresh the redirect
    // target; the callback hit reuses whatever was stored on the first pass.
    if (!c.req.query('code')) {
      const redirect = validateRedirectPath(c.req.query('redirect'));
      setCookie(c, 'oauth_redirect', redirect, {
        maxAge: 300,
        httpOnly: true,
        path: '/',
        sameSite: 'Lax',
        secure: c.env.APP_ENV === 'production',
      });
    }
    await next();
  },
  googleAuth({ scope: ['openid', 'email', 'profile'] }),
  async (c) => {
    const redirectPath = getCookie(c, 'oauth_redirect') ?? '/';
    deleteCookie(c, 'oauth_redirect', { path: '/' });

    const googleUser = c.get('user-google');
    if (!googleUser?.email || !googleUser.verified_email) {
      return c.redirect(`${c.env.FRONTEND_URL}/login?error=oauth_failed`);
    }

    const user = await upsertUserByEmail(c.env.DB, {
      email: googleUser.email,
      name: googleUser.name ?? googleUser.email,
    });
    const sessionId = await createSession(c.env.SESSIONS, user);

    setCookie(c, 'session_id', sessionId, {
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
      secure: c.env.APP_ENV === 'production',
    });

    return c.redirect(`${c.env.FRONTEND_URL}${redirectPath}`);
  },
);
