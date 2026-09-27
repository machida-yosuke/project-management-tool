import { describe, expect, it } from 'vitest';
import { api } from './helpers';

describe('requireAuth', () => {
  it.each([
    ['GET', '/api/projects'],
    ['POST', '/api/projects'],
    ['GET', '/api/projects/any/tasks'],
    ['GET', '/api/invitations'],
    ['POST', '/api/invitations/any/accept'],
  ])('%s %s returns 401 without a session', async (method, path) => {
    const res = await api(null, path, { method });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('returns 401 for an unknown session id', async () => {
    const res = await api(
      { id: 'x', email: 'x', name: 'x', cookie: 'session_id=nope' },
      '/api/projects',
    );
    expect(res.status).toBe(401);
  });
});
