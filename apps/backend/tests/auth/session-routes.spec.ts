import { env } from 'cloudflare:workers';
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createSession } from '../../src/auth/session';
import { upsertUserByEmail } from '../../src/auth/users';

async function createSessionFor(label: string) {
  const user = await upsertUserByEmail(env.DB, {
    email: `${label}-${crypto.randomUUID()}@example.com`,
    name: label,
  });
  const sessionId = await createSession(env.SESSIONS, user);
  return { user, cookie: `session_id=${sessionId}` };
}

describe('GET /api/auth/me', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await SELF.fetch('http://example.com/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the user for a valid session cookie', async () => {
    const { user, cookie } = await createSessionFor('me');

    const res = await SELF.fetch('http://example.com/api/auth/me', { headers: { cookie } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...user, avatarUrl: null });
  });

  it('returns 401 and drops the session when the user no longer exists in D1', async () => {
    const sessionId = await createSession(env.SESSIONS, {
      id: 'user-missing-1',
      email: 'missing@example.com',
      name: 'Missing',
    });

    const res = await SELF.fetch('http://example.com/api/auth/me', {
      headers: { cookie: `session_id=${sessionId}` },
    });

    expect(res.status).toBe(401);
    expect(await env.SESSIONS.get(sessionId)).toBeNull();
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session so /api/auth/me subsequently returns 401', async () => {
    const { cookie } = await createSessionFor('logout');

    const logoutRes = await SELF.fetch('http://example.com/api/auth/logout', {
      method: 'POST',
      headers: { cookie },
    });
    expect(logoutRes.status).toBe(204);

    const meRes = await SELF.fetch('http://example.com/api/auth/me', { headers: { cookie } });
    expect(meRes.status).toBe(401);
  });
});
