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
import { attachmentsRoute } from './routes/attachments';
import { meRoute } from './routes/me';
import { avatarsRoute } from './routes/avatars';
import { requireAuth } from './middleware/require-auth';
import { rateLimit } from './middleware/rate-limit';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '/api/*',
  cors({
    origin: (_origin, c: Context<{ Bindings: Env }>) => c.env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use('*', rateLimit);

app.route('/health', healthRoute);
app.route('/api/auth/google', googleAuthRoute);
app.route('/api/auth', authSessionRoute);

app.use('/api/projects/*', requireAuth);
app.use('/api/invitations/*', requireAuth);
app.use('/api/me/*', requireAuth);
app.use('/api/avatars/*', requireAuth);
app.route('/api/projects/:projectId/tasks/:taskId/comments', commentsRoute);
app.route('/api/projects/:projectId/tasks', tasksRoute);
app.route('/api/projects/:projectId/members', membersRoute);
app.route('/api/projects/:projectId/invitations', projectInvitationsRoute);
app.route('/api/projects/:projectId/attachments', attachmentsRoute);
app.route('/api/projects', projectsRoute);
app.route('/api/invitations', invitationsRoute);
app.route('/api/me', meRoute);
app.route('/api/avatars', avatarsRoute);

export type AppType = typeof app;
export default app;
