import { Hono } from 'hono';
import type { Env } from '../../env';

// TODO: wire up @hono/oauth-providers/google once GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
// are available (see apps/backend/.dev.vars.example).
// GET /api/auth/google       -> redirect to Google's consent screen
// GET /api/auth/google/callback -> exchange code, create a session in env.SESSIONS
export const googleAuthRoute = new Hono<{ Bindings: Env }>();
