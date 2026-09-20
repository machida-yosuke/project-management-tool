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
