# Google OAuth Login/Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google-only OAuth login/sign-in to the project management tool: backend session issuance via Cloudflare KV, and a Pinia-backed frontend that gates the app behind authentication.

**Architecture:** `@hono/oauth-providers/google` handles the OAuth handshake (including CSRF `state` verification) at a single `GET /api/auth/google` route that both starts the flow and receives Google's callback (its `redirect_uri` defaults to its own URL). After a successful handshake, the backend upserts a `users` row by email, mints a random session id, stores `{id, email, name}` in KV with a fixed 7-day TTL, and sets it as an `HttpOnly` cookie. The frontend uses a Pinia store to track auth state, a Vue Router navigation guard to redirect unauthenticated users to `/login`, and a short-lived `oauth_redirect` cookie to carry the post-login destination through the OAuth redirect (validated on both ends against open-redirect abuse).

**Tech Stack:** Hono, `@hono/oauth-providers/google` (>=0.8.6, see CVE-2026-81888), drizzle-orm, Cloudflare KV/D1, Vue 3, Pinia, Vue Router.

**Reference:** Design spec at `docs/superpowers/specs/2026-09-20-google-oauth-login-design.md`. Two corrections found during API research (reflected in this plan, not yet in the spec): the Google profile's verified-email field is `verified_email` (not `email_verified`), and there is no separate `/api/auth/google/callback` route — one route handles both directions.

---

### Task 1: Shared redirect-path validator

**Files:**
- Modify: `packages/shared/package.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/validateRedirectPath.ts`
- Create: `packages/shared/tests/validateRedirectPath.spec.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add vitest to the shared package**

Edit `packages/shared/package.json` (current content shown, replace in full):

```json
{
  "name": "@pm-tool/shared",
  "private": true,
  "type": "module",
  "version": "0.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^4.1.0"
  }
}
```

Run: `cd /Users/my/project-management-tool && pnpm install`
Expected: install succeeds, `vitest` appears under `packages/shared` in the workspace.

- [ ] **Step 2: Create the vitest config**

Create `packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {},
});
```

- [ ] **Step 3: Write the failing test**

Create `packages/shared/tests/validateRedirectPath.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateRedirectPath } from '../src/validateRedirectPath';

describe('validateRedirectPath', () => {
  it('returns / when given undefined', () => {
    expect(validateRedirectPath(undefined)).toBe('/');
  });

  it('returns / when given an empty string', () => {
    expect(validateRedirectPath('')).toBe('/');
  });

  it('accepts a same-origin relative path', () => {
    expect(validateRedirectPath('/projects/123')).toBe('/projects/123');
  });

  it('rejects an absolute URL', () => {
    expect(validateRedirectPath('https://evil.com')).toBe('/');
  });

  it('rejects a protocol-relative URL', () => {
    expect(validateRedirectPath('//evil.com')).toBe('/');
  });

  it('rejects a backslash-prefixed path (browsers treat it as protocol-relative)', () => {
    expect(validateRedirectPath('/\\evil.com')).toBe('/');
  });

  it('rejects a path with no leading slash', () => {
    expect(validateRedirectPath('projects/123')).toBe('/');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd /Users/my/project-management-tool/packages/shared && pnpm test`
Expected: FAIL — `Cannot find module '../src/validateRedirectPath'`

- [ ] **Step 5: Implement the function**

Create `packages/shared/src/validateRedirectPath.ts`:

```ts
export function validateRedirectPath(value: string | null | undefined): string {
  if (!value) return '/';
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /Users/my/project-management-tool/packages/shared && pnpm test`
Expected: PASS, 7 tests passed.

- [ ] **Step 7: Export it from the package entrypoint**

Edit `packages/shared/src/index.ts`:

```ts
export interface HealthCheckResponse {
  status: 'ok';
}

export { validateRedirectPath } from './validateRedirectPath';
```

- [ ] **Step 8: Run shared typecheck**

Run: `cd /Users/my/project-management-tool/packages/shared && pnpm typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/my/project-management-tool
git add packages/shared
git commit -m "$(cat <<'EOF'
Add shared redirect-path validator for OAuth login flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Backend D1 test migrations + `upsertUserByEmail`

**Files:**
- Modify: `apps/backend/vitest.config.ts`
- Create: `apps/backend/tests/apply-migrations.ts`
- Create: `apps/backend/src/auth/users.ts`
- Create: `apps/backend/tests/auth/users.spec.ts`

- [ ] **Step 1: Wire D1 migrations and test OAuth credentials into the test config**

Edit `apps/backend/vitest.config.ts` (replace in full):

```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
      return {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            GOOGLE_ID: 'test-google-client-id',
            GOOGLE_SECRET: 'test-google-client-secret',
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ['./tests/apply-migrations.ts'],
  },
});
```

- [ ] **Step 2: Create the migration-applying setup file**

Create `apps/backend/tests/apply-migrations.ts`:

```ts
import { env } from 'cloudflare:workers';
import { applyD1Migrations, type D1Migration } from 'cloudflare:test';

interface TestEnv {
  TEST_MIGRATIONS: D1Migration[];
}

await applyD1Migrations(env.DB, (env as unknown as TestEnv).TEST_MIGRATIONS);
```

Note: `TEST_MIGRATIONS` is injected only via the `miniflare.bindings` test config above, not part of the production `Env` type, hence the cast. If this errors at typecheck time because `env` from `cloudflare:workers` isn't structurally compatible with the cast, use `as unknown as TestEnv` exactly as shown (already applied) — do not weaken this to `any` elsewhere.

- [ ] **Step 3: Verify existing tests still run with the new setup**

Run: `cd /Users/my/project-management-tool/apps/backend && pnpm test`
Expected: PASS — the existing `tests/health.spec.ts` still passes; this confirms migrations apply without error before any test runs.

- [ ] **Step 4: Write the failing test for upsertUserByEmail**

Create `apps/backend/tests/auth/users.spec.ts`:

```ts
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { upsertUserByEmail } from '../../src/auth/users';

describe('upsertUserByEmail', () => {
  it('creates a new user when none exists for the email', async () => {
    const user = await upsertUserByEmail(env.DB, {
      email: 'new-user@example.com',
      name: 'New User',
    });

    expect(user.email).toBe('new-user@example.com');
    expect(user.name).toBe('New User');
    expect(user.id).toBeTruthy();
  });

  it('returns the existing user on a repeat login without changing stored data', async () => {
    const first = await upsertUserByEmail(env.DB, {
      email: 'dup-user@example.com',
      name: 'First Name',
    });
    const second = await upsertUserByEmail(env.DB, {
      email: 'dup-user@example.com',
      name: 'Second Name',
    });

    expect(second.id).toBe(first.id);
    expect(second.name).toBe('First Name');
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd /Users/my/project-management-tool/apps/backend && pnpm test`
Expected: FAIL — `Cannot find module '../../src/auth/users'`

- [ ] **Step 6: Implement upsertUserByEmail**

Create `apps/backend/src/auth/users.ts`:

```ts
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import { users } from '../db/schema';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
}

export async function upsertUserByEmail(
  db: D1Database,
  profile: { email: string; name: string },
): Promise<UserRecord> {
  const orm = drizzle(db);
  const existingRows = await orm.select().from(users).where(eq(users.email, profile.email));
  const existing = existingRows[0];
  if (existing) {
    return { id: existing.id, email: existing.email, name: existing.name };
  }

  const id = crypto.randomUUID();
  await orm.insert(users).values({
    id,
    email: profile.email,
    name: profile.name,
    createdAt: new Date(),
  });
  return { id, email: profile.email, name: profile.name };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd /Users/my/project-management-tool/apps/backend && pnpm test`
Expected: PASS, all tests including the 2 new ones pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/my/project-management-tool
git add apps/backend
git commit -m "$(cat <<'EOF'
Add D1 test migrations wiring and upsertUserByEmail

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Backend session management (KV)

**Files:**
- Create: `apps/backend/src/auth/session.ts`
- Create: `apps/backend/tests/auth/session.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/tests/auth/session.spec.ts`:

```ts
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createSession, destroySession, getSessionUser } from '../../src/auth/session';

describe('session', () => {
  it('creates a session and retrieves the user from it', async () => {
    const user = { id: 'user-1', email: 'a@example.com', name: 'A' };
    const sessionId = await createSession(env.SESSIONS, user);

    const result = await getSessionUser(env.SESSIONS, sessionId);

    expect(result).toEqual(user);
  });

  it('returns null for an unknown session id', async () => {
    const result = await getSessionUser(env.SESSIONS, 'does-not-exist');
    expect(result).toBeNull();
  });

  it('returns null when session id is undefined', async () => {
    const result = await getSessionUser(env.SESSIONS, undefined);
    expect(result).toBeNull();
  });

  it('removes the session on destroy', async () => {
    const user = { id: 'user-2', email: 'b@example.com', name: 'B' };
    const sessionId = await createSession(env.SESSIONS, user);

    await destroySession(env.SESSIONS, sessionId);

    expect(await getSessionUser(env.SESSIONS, sessionId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/my/project-management-tool/apps/backend && pnpm test`
Expected: FAIL — `Cannot find module '../../src/auth/session'`

- [ ] **Step 3: Implement session management**

Create `apps/backend/src/auth/session.ts`:

```ts
import type { KVNamespace } from '@cloudflare/workers-types';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function createSession(kv: KVNamespace, user: SessionUser): Promise<string> {
  const sessionId = crypto.randomUUID();
  await kv.put(sessionId, JSON.stringify(user), { expirationTtl: SESSION_TTL_SECONDS });
  return sessionId;
}

export async function getSessionUser(
  kv: KVNamespace,
  sessionId: string | undefined,
): Promise<SessionUser | null> {
  if (!sessionId) return null;
  const raw = await kv.get(sessionId);
  if (!raw) return null;
  return JSON.parse(raw) as SessionUser;
}

export async function destroySession(kv: KVNamespace, sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await kv.delete(sessionId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/my/project-management-tool/apps/backend && pnpm test`
Expected: PASS, all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/my/project-management-tool
git add apps/backend/src/auth/session.ts apps/backend/tests/auth/session.spec.ts
git commit -m "$(cat <<'EOF'
Add KV-backed session create/read/destroy helpers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Env type, wrangler config, and dev vars

**Files:**
- Modify: `apps/backend/src/env.ts`
- Modify: `apps/backend/wrangler.jsonc`
- Modify: `apps/backend/.dev.vars.example`

- [ ] **Step 1: Add OAuth/frontend env vars to the Env type**

Edit `apps/backend/src/env.ts` (replace in full):

```ts
import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  CACHE: KVNamespace;
  ATTACHMENTS: R2Bucket;
  APP_ENV: string;
  FRONTEND_URL: string;
  GOOGLE_ID: string;
  GOOGLE_SECRET: string;
}
```

- [ ] **Step 2: Add FRONTEND_URL to wrangler.jsonc vars**

Edit `apps/backend/wrangler.jsonc`, changing the `vars` block:

```jsonc
  "vars": {
    "APP_ENV": "development",
    "FRONTEND_URL": "http://localhost:5173",
  },
```

(Leave every other key in the file unchanged — only the `vars` object's contents change.)

- [ ] **Step 3: Replace the dev vars example with the names the OAuth library expects**

Edit `apps/backend/.dev.vars.example` (replace in full):

```
GOOGLE_ID=
GOOGLE_SECRET=
```

Note: `@hono/oauth-providers/google` reads `GOOGLE_ID`/`GOOGLE_SECRET` from the environment by default (confirmed from its source at `node_modules/.pnpm/@hono+oauth-providers@*/node_modules/@hono/oauth-providers/dist/google/index.mjs`) — do not rename these. `SESSION_SECRET` is dropped: nothing in this design signs or encrypts tokens, so it was unused.

- [ ] **Step 4: Run backend typecheck**

Run: `cd /Users/my/project-management-tool/apps/backend && pnpm typecheck`
Expected: no errors (Env additions are additive; nothing reads them yet).

- [ ] **Step 5: Commit**

```bash
cd /Users/my/project-management-tool
git add apps/backend/src/env.ts apps/backend/wrangler.jsonc apps/backend/.dev.vars.example
git commit -m "$(cat <<'EOF'
Add FRONTEND_URL/GOOGLE_ID/GOOGLE_SECRET env vars for OAuth

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Google OAuth route

**Files:**
- Modify: `apps/backend/src/routes/auth/google.ts`
- Create: `apps/backend/tests/auth/google.spec.ts`

This route cannot be fully tested without a real Google account (the code-exchange path calls `https://oauth2.googleapis.com` and `https://www.googleapis.com` directly inside the library). Tests here cover everything before that boundary: the initial redirect, and the `oauth_redirect` cookie/redirect-path validation. The code-exchange branch is verified manually in Task 12.

- [ ] **Step 1: Install the OAuth library**

Run: `cd /Users/my/project-management-tool && pnpm --filter backend add "@hono/oauth-providers@^0.8.6"`
Expected: `@hono/oauth-providers` added to `apps/backend/package.json` dependencies at `^0.8.6` or later. This version is required — versions before 0.8.6 have a CSRF vulnerability (CVE-2026-81888) in `state` parameter verification.

- [ ] **Step 2: Write the failing tests for the pre-Google-redirect behavior**

Create `apps/backend/tests/auth/google.spec.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('GET /api/auth/google', () => {
  it('redirects to the Google consent screen when no code is present', async () => {
    const res = await SELF.fetch('http://example.com/api/auth/google', { redirect: 'manual' });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
  });

  it('stores a validated redirect target in the oauth_redirect cookie', async () => {
    const res = await SELF.fetch('http://example.com/api/auth/google?redirect=%2Fprojects%2F1', {
      redirect: 'manual',
    });

    expect(res.headers.get('set-cookie')).toContain('oauth_redirect=%2Fprojects%2F1');
  });

  it('falls back to / when the redirect query is an external URL', async () => {
    const res = await SELF.fetch(
      'http://example.com/api/auth/google?redirect=https%3A%2F%2Fevil.com',
      { redirect: 'manual' },
    );

    expect(res.headers.get('set-cookie')).toContain('oauth_redirect=%2F;');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /Users/my/project-management-tool/apps/backend && pnpm test`
Expected: FAIL — the route currently does nothing (empty `Hono` instance), so these requests 404.

- [ ] **Step 4: Implement the route**

Edit `apps/backend/src/routes/auth/google.ts` (replace in full):

```ts
import { Hono } from 'hono';
import { googleAuth } from '@hono/oauth-providers/google';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { validateRedirectPath } from '@pm-tool/shared';
import type { Env } from '../../env';
import { upsertUserByEmail } from '../../auth/users';
import { createSession } from '../../auth/session';

export const googleAuthRoute = new Hono<{ Bindings: Env }>();

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /Users/my/project-management-tool/apps/backend && pnpm test`
Expected: PASS, all tests pass.

- [ ] **Step 6: Run backend typecheck and lint**

Run: `cd /Users/my/project-management-tool/apps/backend && pnpm typecheck && pnpm lint`
Expected: no errors. If `googleAuth`'s type for `user-google` conflicts with the `verified_email`/`email`/`name` access above, this is a `Partial<GoogleUser>` from the library (all fields optional) — the existing `?.` / truthiness checks already handle that; do not add a type assertion.

- [ ] **Step 7: Commit**

```bash
cd /Users/my/project-management-tool
git add apps/backend/src/routes/auth/google.ts apps/backend/tests/auth/google.spec.ts
git commit -m "$(cat <<'EOF'
Implement Google OAuth start/callback route

Handles both directions of the OAuth handshake at GET
/api/auth/google (the library's redirect_uri defaults to its own
URL, so no separate /callback route exists). Validates the
redirect target against open-redirect abuse via the shared
validateRedirectPath, and upserts/sessions the user on success.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `/api/auth/me` and `/api/auth/logout`

**Files:**
- Create: `apps/backend/src/routes/auth/session.ts`
- Create: `apps/backend/tests/auth/session-routes.spec.ts`
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/tests/auth/session-routes.spec.ts`:

```ts
import { env } from 'cloudflare:workers';
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createSession } from '../../src/auth/session';

describe('GET /api/auth/me', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await SELF.fetch('http://example.com/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the user for a valid session cookie', async () => {
    const user = { id: 'user-me-1', email: 'me@example.com', name: 'Me' };
    const sessionId = await createSession(env.SESSIONS, user);

    const res = await SELF.fetch('http://example.com/api/auth/me', {
      headers: { cookie: `session_id=${sessionId}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(user);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session so /api/auth/me subsequently returns 401', async () => {
    const user = { id: 'user-logout-1', email: 'logout@example.com', name: 'Logout' };
    const sessionId = await createSession(env.SESSIONS, user);

    const logoutRes = await SELF.fetch('http://example.com/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `session_id=${sessionId}` },
    });
    expect(logoutRes.status).toBe(204);

    const meRes = await SELF.fetch('http://example.com/api/auth/me', {
      headers: { cookie: `session_id=${sessionId}` },
    });
    expect(meRes.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/my/project-management-tool/apps/backend && pnpm test`
Expected: FAIL — both routes 404 (not mounted yet).

- [ ] **Step 3: Implement the routes**

Create `apps/backend/src/routes/auth/session.ts`:

```ts
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
  deleteCookie(c, 'session_id', { path: '/' });
  return c.body(null, 204);
});
```

- [ ] **Step 4: Mount the route**

Edit `apps/backend/src/index.ts` (replace in full):

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /Users/my/project-management-tool/apps/backend && pnpm test`
Expected: PASS, all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/my/project-management-tool
git add apps/backend/src/routes/auth/session.ts apps/backend/tests/auth/session-routes.spec.ts apps/backend/src/index.ts
git commit -m "$(cat <<'EOF'
Add GET /api/auth/me and POST /api/auth/logout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: CORS for credentialed frontend requests

**Files:**
- Modify: `apps/backend/src/index.ts`

The frontend calls `/api/auth/me` and `/api/auth/logout` with `credentials: 'include'` so the session cookie is sent; that requires the backend to echo back a specific (non-wildcard) `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials: true`.

- [ ] **Step 1: Add the CORS middleware**

Edit `apps/backend/src/index.ts` (replace in full):

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { healthRoute } from './routes/health';
import { googleAuthRoute } from './routes/auth/google';
import { authSessionRoute } from './routes/auth/session';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '/api/*',
  cors({
    origin: (_origin, c) => c.env.FRONTEND_URL,
    credentials: true,
  }),
);

app.route('/health', healthRoute);
app.route('/api/auth/google', googleAuthRoute);
app.route('/api/auth', authSessionRoute);

export type AppType = typeof app;
export default app;
```

- [ ] **Step 2: Run the full backend test suite**

Run: `cd /Users/my/project-management-tool/apps/backend && pnpm test`
Expected: PASS, all existing tests still pass (CORS only adds response headers, doesn't change status codes for same-origin `SELF.fetch` calls used in tests).

- [ ] **Step 3: Run typecheck and lint**

Run: `cd /Users/my/project-management-tool/apps/backend && pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/my/project-management-tool
git add apps/backend/src/index.ts
git commit -m "$(cat <<'EOF'
Add CORS for credentialed requests from the frontend origin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Pinia auth store (frontend)

**Files:**
- Modify: `apps/frontend/package.json`
- Modify: `apps/frontend/src/main.ts`
- Create: `apps/frontend/src/stores/auth.ts`
- Create: `apps/frontend/tests/stores/auth.spec.ts`

- [ ] **Step 1: Add pinia**

Run: `cd /Users/my/project-management-tool && pnpm --filter frontend add pinia@^2`
Expected: `pinia` added to `apps/frontend/package.json` dependencies.

- [ ] **Step 2: Write the failing tests**

Create `apps/frontend/tests/stores/auth.spec.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/stores/auth';

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets authenticated state when /api/auth/me succeeds', async () => {
    const user = { id: '1', email: 'a@example.com', name: 'A' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(user), { status: 200 })),
    );

    const store = useAuthStore();
    await store.fetchMe();

    expect(store.status).toBe('authenticated');
    expect(store.user).toEqual(user);
  });

  it('sets unauthenticated state when /api/auth/me returns 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const store = useAuthStore();
    await store.fetchMe();

    expect(store.status).toBe('unauthenticated');
    expect(store.user).toBeNull();
  });

  it('clears user state on logout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const store = useAuthStore();
    store.user = { id: '1', email: 'a@example.com', name: 'A' };
    store.status = 'authenticated';

    await store.logout();

    expect(store.status).toBe('unauthenticated');
    expect(store.user).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /Users/my/project-management-tool/apps/frontend && pnpm test`
Expected: FAIL — `Cannot find module '../../src/stores/auth'`

- [ ] **Step 4: Implement the store**

Create `apps/frontend/src/stores/auth.ts`:

```ts
import { defineStore } from 'pinia';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    status: 'idle' as AuthStatus,
  }),
  actions: {
    async fetchMe() {
      this.status = 'loading';
      const res = await fetch(`${apiBaseUrl}/api/auth/me`, { credentials: 'include' });
      if (res.ok) {
        this.user = (await res.json()) as AuthUser;
        this.status = 'authenticated';
      } else {
        this.user = null;
        this.status = 'unauthenticated';
      }
    },
    async logout() {
      await fetch(`${apiBaseUrl}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      this.user = null;
      this.status = 'unauthenticated';
    },
  },
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /Users/my/project-management-tool/apps/frontend && pnpm test`
Expected: PASS, all 3 new tests pass.

- [ ] **Step 6: Register Pinia in the app**

Edit `apps/frontend/src/main.ts` (replace in full):

```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';
import App from './App.vue';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
```

- [ ] **Step 7: Commit**

```bash
cd /Users/my/project-management-tool
git add apps/frontend/package.json apps/frontend/pnpm-lock.yaml apps/frontend/src/main.ts apps/frontend/src/stores apps/frontend/tests/stores pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
Add Pinia auth store and register Pinia in the app

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

(If `apps/frontend/pnpm-lock.yaml` doesn't exist as a separate file — this is a workspace, so the lockfile is at the repo root — just `git add pnpm-lock.yaml` instead; check with `git status` first.)

---

### Task 9: LoginView

**Files:**
- Create: `apps/frontend/src/views/LoginView.vue`
- Create: `apps/frontend/tests/LoginView.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/tests/LoginView.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../src/views/LoginView.vue';

async function mountAtLoginPath(fullPath: string) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/login', name: 'login', component: LoginView }],
  });
  await router.push(fullPath);
  await router.isReady();
  return mount(LoginView, { global: { plugins: [router] } });
}

describe('LoginView', () => {
  it('links to the Google OAuth endpoint with a validated redirect', async () => {
    const wrapper = await mountAtLoginPath('/login?redirect=/projects/1');

    expect(wrapper.get('a').attributes('href')).toBe(
      'http://localhost:8787/api/auth/google?redirect=%2Fprojects%2F1',
    );
  });

  it('falls back to / for an external redirect value', async () => {
    const wrapper = await mountAtLoginPath('/login?redirect=https://evil.com');

    expect(wrapper.get('a').attributes('href')).toBe(
      'http://localhost:8787/api/auth/google?redirect=%2F',
    );
  });

  it('defaults to / when no redirect query is given', async () => {
    const wrapper = await mountAtLoginPath('/login');

    expect(wrapper.get('a').attributes('href')).toBe(
      'http://localhost:8787/api/auth/google?redirect=%2F',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/my/project-management-tool/apps/frontend && pnpm test`
Expected: FAIL — `Failed to resolve import "../src/views/LoginView.vue"`

- [ ] **Step 3: Implement the view**

Create `apps/frontend/src/views/LoginView.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { validateRedirectPath } from '@pm-tool/shared';

const route = useRoute();
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

const loginUrl = computed(() => {
  const redirectParam = route.query.redirect;
  const redirect = validateRedirectPath(
    typeof redirectParam === 'string' ? redirectParam : undefined,
  );
  return `${apiBaseUrl}/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
});
</script>

<template>
  <div>
    <h1>Login</h1>
    <a :href="loginUrl">Googleでログイン</a>
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/my/project-management-tool/apps/frontend && pnpm test`
Expected: PASS, all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/my/project-management-tool
git add apps/frontend/src/views/LoginView.vue apps/frontend/tests/LoginView.spec.ts
git commit -m "$(cat <<'EOF'
Add LoginView with validated post-login redirect

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Router guard

**Files:**
- Create: `apps/frontend/src/router/guards.ts`
- Create: `apps/frontend/tests/router/guards.spec.ts`
- Modify: `apps/frontend/src/router/index.ts`

The guard is extracted into its own function so it can be unit-tested by calling it directly, instead of driving a full router instance (which would duplicate the guard logic in the test and couple the test to the singleton router in `src/router/index.ts`).

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/tests/router/guards.spec.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteLocationNormalized } from 'vue-router';
import { requireAuthGuard } from '../../src/router/guards';
import { useAuthStore } from '../../src/stores/auth';

function makeRoute(path: string, requiresAuth: boolean): RouteLocationNormalized {
  return {
    path,
    fullPath: path,
    meta: { requiresAuth },
  } as RouteLocationNormalized;
}

describe('requireAuthGuard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allows navigation when the target route does not require auth', async () => {
    const result = await requireAuthGuard(makeRoute('/login', false), makeRoute('/', true));
    expect(result).toBe(true);
  });

  it('redirects to /login with a redirect query when unauthenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const result = await requireAuthGuard(makeRoute('/', true), makeRoute('/', true));

    expect(result).toEqual({ path: '/login', query: { redirect: '/' } });
  });

  it('allows navigation when already authenticated', async () => {
    const authStore = useAuthStore();
    authStore.status = 'authenticated';
    authStore.user = { id: '1', email: 'a@example.com', name: 'A' };

    const result = await requireAuthGuard(makeRoute('/', true), makeRoute('/', true));

    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/my/project-management-tool/apps/frontend && pnpm test`
Expected: FAIL — `Cannot find module '../../src/router/guards'`

- [ ] **Step 3: Implement the guard**

Create `apps/frontend/src/router/guards.ts`:

```ts
import type { NavigationGuardWithThis } from 'vue-router';
import { useAuthStore } from '../stores/auth';

export const requireAuthGuard: NavigationGuardWithThis<undefined> = async (to) => {
  if (!to.meta.requiresAuth) return true;

  const authStore = useAuthStore();
  if (authStore.status === 'idle') {
    await authStore.fetchMe();
  }
  if (authStore.status !== 'authenticated') {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  return true;
};
```

- [ ] **Step 4: Declare the `requiresAuth` route meta field**

Create `apps/frontend/src/router/meta.d.ts`:

```ts
import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /Users/my/project-management-tool/apps/frontend && pnpm test`
Expected: PASS, all 3 tests pass.

- [ ] **Step 6: Wire the guard and the `/login` route into the router**

Edit `apps/frontend/src/router/index.ts` (replace in full):

```ts
import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import LoginView from '../views/LoginView.vue';
import { requireAuthGuard } from './guards';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: LoginView },
  ],
});

router.beforeEach(requireAuthGuard);
```

- [ ] **Step 7: Run frontend typecheck**

Run: `cd /Users/my/project-management-tool/apps/frontend && pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/my/project-management-tool
git add apps/frontend/src/router apps/frontend/tests/router
git commit -m "$(cat <<'EOF'
Add auth-required route guard, extracted for unit testing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: App.vue header + auth bootstrap

**Files:**
- Modify: `apps/frontend/src/App.vue`
- Modify: `apps/frontend/tests/App.spec.ts`

- [ ] **Step 1: Update the existing App.spec.ts to provide Pinia and avoid the now-guarded `/` route**

Edit `apps/frontend/tests/App.spec.ts` (replace in full):

```ts
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { router } from '../src/router';
import App from '../src/App.vue';

describe('App', () => {
  it('renders the app title', async () => {
    await router.push('/login');
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } });

    expect(wrapper.text()).toContain('Project Management Tool');
  });
});
```

- [ ] **Step 2: Run the test to confirm the pre-change baseline**

Run: `cd /Users/my/project-management-tool/apps/frontend && pnpm test`
Expected: PASS. `App.vue` hasn't been touched yet at this point, so this only confirms the updated test file (with Pinia + `/login`) still works against the old component before Step 3 changes it. There's no Red here because this task extends an existing component rather than adding a new one from scratch.

- [ ] **Step 3: Add the header and auth bootstrap to App.vue**

Edit `apps/frontend/src/App.vue` (replace in full):

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';

const authStore = useAuthStore();

onMounted(() => {
  if (authStore.status === 'idle') {
    void authStore.fetchMe();
  }
});
</script>

<template>
  <h1>Project Management Tool</h1>
  <div v-if="authStore.status === 'authenticated'">
    <span>{{ authStore.user?.name }}</span>
    <button type="button" @click="authStore.logout()">ログアウト</button>
  </div>
  <router-view />
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/my/project-management-tool/apps/frontend && pnpm test`
Expected: PASS. Note this test doesn't stub `fetch`, so `authStore.fetchMe()` will reject/fail silently in the background during the test — that's fine, it's fired from `onMounted` without being awaited by the test, and the assertion only checks the static title text.

- [ ] **Step 5: Run frontend typecheck, lint, and build**

Run: `cd /Users/my/project-management-tool/apps/frontend && pnpm typecheck && pnpm lint && pnpm build`
Expected: no errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/my/project-management-tool
git add apps/frontend/src/App.vue apps/frontend/tests/App.spec.ts
git commit -m "$(cat <<'EOF'
Show logged-in user/logout in App.vue and bootstrap auth on mount

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Manual Google Cloud Console setup + end-to-end verification

**Files:** none (configuration + manual verification only)

This task cannot be automated — it requires a real Google account and a browser. Do it after Task 11 is committed.

**Important — local HTTPS is required, not optional.** Task 5's code review verified (by reading `@hono/oauth-providers/google`'s source) that the library hardcodes `secure: true` on its own internal `state` cookie, regardless of environment. Browsers silently refuse to store `Secure` cookies set over plain HTTP, so running the backend at `http://localhost:8787` (the default for `pnpm dev`) makes the login flow fail 100% of the time with an opaque `401` on the callback — not a flaky failure, a guaranteed one. Steps below start the backend over HTTPS instead.

- [ ] **Step 1: Create the OAuth client**

In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth 2.0 Client ID (Web application type). Add `https://localhost:8787/api/auth/google` (note: `https`, not `http`) as an authorized redirect URI — this must exactly match the URL the backend will actually be served at in Step 4 below, since `redirect_uri` defaults to the request's own URL per `googleAuth()`'s implementation.

- [ ] **Step 2: Set local secrets**

```bash
cd /Users/my/project-management-tool/apps/backend
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and fill in `GOOGLE_ID` and `GOOGLE_SECRET` from the client created in Step 1.

- [ ] **Step 3: Run the full workspace verification**

Run: `cd /Users/my/project-management-tool && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all pass.

- [ ] **Step 4: Start the backend over HTTPS and the frontend normally**

In one terminal, start the backend with `wrangler`'s built-in self-signed-certificate HTTPS mode (confirmed available via `pnpm exec wrangler dev --help` → `--local-protocol` accepts `https`):

```bash
cd /Users/my/project-management-tool/apps/backend
pnpm exec wrangler dev --local-protocol https
```

Expected: backend on `https://localhost:8787`. In a second terminal, start the frontend as usual (it stays plain HTTP — only the backend needs HTTPS, since it's the one setting the `Secure` cookie; the frontend origin doesn't need to match):

```bash
cd /Users/my/project-management-tool/apps/frontend
pnpm dev
```

Expected: frontend on `http://localhost:5173`.

Before logging in, open `https://localhost:8787/health` directly in the browser once and accept the self-signed-certificate warning (e.g. Chrome: "Advanced" → "Proceed to localhost (unsafe)"). This is required — otherwise the browser silently fails the CORS preflight / fetch calls the frontend makes to the backend, which is easy to misdiagnose as a code bug.

- [ ] **Step 5: Manually verify the full login flow**

1. Open `http://localhost:5173/` in a browser — expect an immediate redirect to `http://localhost:5173/login?redirect=%2F`.
2. Click "Googleでログイン" — expect a redirect to Google's consent screen.
3. Approve with a real Google account — expect a redirect back to `http://localhost:5173/`, now showing the account's name and a logout button (confirms the cookie round-trip, the `users` upsert, and the KV session all worked).
4. Click "ログアウト" — expect the name/logout button to disappear.
5. Reload `http://localhost:5173/` — expect the redirect to `/login` again (session cleared).
6. Repeat step 1–3, then manually navigate to `http://localhost:5173/nonexistent-but-past-guard-path` is unnecessary; instead verify the redirect-preservation UX directly: while logged out, open `http://localhost:5173/` in a fresh tab, confirm you land on `/login?redirect=%2F`, log in, and confirm you land back on `/` (not some other page) — this is the full redirect round-trip this design exists to support.

If Step 5.2's redirect to Google fails or the callback 401s even after Step 4's HTTPS setup, check: (a) the redirect URI registered in Google Cloud Console matches `https://localhost:8787/api/auth/google` exactly, (b) the self-signed cert warning was actually accepted in the browser (not just dismissed), (c) `.dev.vars` has real, non-empty `GOOGLE_ID`/`GOOGLE_SECRET` values.

- [ ] **Step 6: Note any deviations**

If any manual step doesn't match, fix the code and repeat Tasks 5/6/8–11's automated tests before re-verifying manually. Do not commit a "fix" without an accompanying automated test unless the fix is only reachable through the real Google network calls this task exists to cover.

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-09-20-google-oauth-login-design.md` maps to a task — session model (Task 3), redirect validation (Task 1/5/9), CORS (Task 7), `@hono/oauth-providers` version pin (already satisfied: `apps/backend/package.json` has `^0.8.8`), `verified_email` check (Task 5), Pinia store (Task 8), router guard (Task 10), UI (Task 11), manual verification (Task 12).
- **Corrections carried from API research:** the spec's `/api/auth/google/callback` route and `email_verified` field name are both superseded by Task 5's single-route design and `verified_email` field — worth updating the spec file itself after this plan lands, but not blocking implementation.
- **Type consistency checked:** `SessionUser`/`UserRecord`/`AuthUser` all use the same `{id, email, name}` shape across Tasks 3, 2, 8 respectively (intentionally separate types per layer — backend KV payload, backend DB row, frontend store — but structurally identical, so JSON round-trips without transformation).
