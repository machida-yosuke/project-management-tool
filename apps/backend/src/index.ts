import { Hono } from 'hono';
import { healthRoute } from './routes/health';
import { googleAuthRoute } from './routes/auth/google';
import { authSessionRoute } from './routes/auth/session';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.route('/health', healthRoute);
app.route('/api/auth/google', googleAuthRoute);
app.route('/api/auth', authSessionRoute);

export type AppType = typeof app;
export default app;
