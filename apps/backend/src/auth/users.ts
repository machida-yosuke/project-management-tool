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
