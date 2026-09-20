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
