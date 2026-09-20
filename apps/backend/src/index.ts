import { Hono } from 'hono';
import { healthRoute } from './routes/health';
import { googleAuthRoute } from './routes/auth/google';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.route('/health', healthRoute);
app.route('/api/auth/google', googleAuthRoute);

export type AppType = typeof app;
export default app;
