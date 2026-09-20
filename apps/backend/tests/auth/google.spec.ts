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
