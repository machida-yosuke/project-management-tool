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
