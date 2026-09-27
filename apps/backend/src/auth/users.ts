import { drizzle } from 'drizzle-orm/d1';
import { and, eq, isNull } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import { users } from '../db/schema';
import { avatarUrlFor } from '../users/avatar';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
}

export interface AuthUser extends UserRecord {
  avatarUrl: string | null;
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

export async function findActiveUserById(db: D1Database, id: string): Promise<AuthUser | null> {
  const rows = await drizzle(db)
    .select({ id: users.id, email: users.email, name: users.name, avatarKey: users.avatarKey })
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)));
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, avatarUrl: avatarUrlFor(row.avatarKey) };
}
