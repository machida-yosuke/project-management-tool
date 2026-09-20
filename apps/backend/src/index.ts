import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { healthRoute } from './routes/health';
import { googleAuthRoute } from './routes/auth/google';
import { authSessionRoute } from './routes/auth/session';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '/api/*',
  cors({
    origin: (_origin, c: Context<{ Bindings: Env }>) => c.env.FRONTEND_URL,
    credentials: true,
  }),
);

app.route('/health', healthRoute);
app.route('/api/auth/google', googleAuthRoute);
app.route('/api/auth', authSessionRoute);

export type AppType = typeof app;
export default app;
