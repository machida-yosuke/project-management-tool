import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';

type Bindings = {
  ASSETS: Fetcher;
  BASIC_AUTH_USER?: string;
  BASIC_AUTH_PASSWORD?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', async (c, next) => {
  const username = c.env.BASIC_AUTH_USER;
  const password = c.env.BASIC_AUTH_PASSWORD;
  // Fail closed: a missing secret must never expose the SPA without auth.
  if (!username || !password) {
    return c.text('Service Unavailable', 503);
  }
  return basicAuth({ username, password })(c, next);
});

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
