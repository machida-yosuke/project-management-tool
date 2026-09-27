import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { healthRoute } from './routes/health';
import { googleAuthRoute } from './routes/auth/google';
import { authSessionRoute } from './routes/auth/session';
import { projectsRoute } from './routes/projects';
import { membersRoute } from './routes/members';
import { invitationsRoute, projectInvitationsRoute } from './routes/invitations';
import { tasksRoute } from './routes/tasks';
import { commentsRoute } from './routes/comments';
import { requireAuth } from './middleware/require-auth';
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

app.use('/api/projects/*', requireAuth);
app.use('/api/invitations/*', requireAuth);
app.route('/api/projects/:projectId/tasks/:taskId/comments', commentsRoute);
app.route('/api/projects/:projectId/tasks', tasksRoute);
app.route('/api/projects/:projectId/members', membersRoute);
app.route('/api/projects/:projectId/invitations', projectInvitationsRoute);
app.route('/api/projects', projectsRoute);
app.route('/api/invitations', invitationsRoute);

export type AppType = typeof app;
export default app;
