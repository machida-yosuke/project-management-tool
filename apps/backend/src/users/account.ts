import { drizzle } from 'drizzle-orm/d1';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { projectMembers, projects, tasks, users } from '../db/schema';
import { findActiveUserById, type AuthUser } from '../auth/users';
import { apiError } from '../projects/errors';
import { avatarKeyFor } from './avatar';

export const DELETED_USER_NAME = '退会したユーザー';

async function requireActiveUser(db: D1Database, userId: string): Promise<AuthUser> {
  const user = await findActiveUserById(db, userId);
  if (!user) throw apiError(401, 'unauthorized');
  return user;
}

async function currentAvatarKey(db: D1Database, userId: string): Promise<string | null> {
  const rows = await drizzle(db)
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId));
  return rows[0]?.avatarKey ?? null;
}

function activeUser(userId: string) {
  return and(eq(users.id, userId), isNull(users.deletedAt));
}

export async function updateName(db: D1Database, userId: string, name: string): Promise<AuthUser> {
  await drizzle(db).update(users).set({ name }).where(activeUser(userId));
  return requireActiveUser(db, userId);
}

export async function setAvatar(
  db: D1Database,
  bucket: R2Bucket,
  user: AuthUser,
  avatar: { bytes: ArrayBuffer; contentType: string },
): Promise<AuthUser> {
  const previousKey = await currentAvatarKey(db, user.id);
  const key = avatarKeyFor(user.id, crypto.randomUUID());
  await bucket.put(key, avatar.bytes, { httpMetadata: { contentType: avatar.contentType } });
  await drizzle(db).update(users).set({ avatarKey: key }).where(activeUser(user.id));
  if (previousKey) await bucket.delete(previousKey);
  return requireActiveUser(db, user.id);
}

export async function removeAvatar(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
): Promise<AuthUser> {
  const previousKey = await currentAvatarKey(db, userId);
  await drizzle(db).update(users).set({ avatarKey: null }).where(activeUser(userId));
  if (previousKey) await bucket.delete(previousKey);
  return requireActiveUser(db, userId);
}

export async function findDeletionBlockers(
  db: D1Database,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  return drizzle(db)
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(eq(projects.ownerId, userId))
    .groupBy(projects.id)
    .having(sql`count(*) > 1`)
    .orderBy(projects.createdAt);
}

export async function deleteAccount(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
): Promise<void> {
  const avatarKey = await currentAvatarKey(db, userId);
  const orm = drizzle(db);
  // The users row is anonymised rather than deleted: tasks, comments, invitations and
  // projects reference it without ON DELETE CASCADE, and their history should survive.
  await orm.batch([
    orm
      .delete(projects)
      .where(
        and(
          eq(projects.ownerId, userId),
          sql`${projects.id} NOT IN (SELECT ${projectMembers.projectId} FROM ${projectMembers} WHERE ${projectMembers.userId} <> ${userId})`,
        ),
      ),
    orm.delete(projectMembers).where(eq(projectMembers.userId, userId)),
    orm.update(tasks).set({ assigneeId: null }).where(eq(tasks.assigneeId, userId)),
    orm
      .update(users)
      .set({
        name: DELETED_USER_NAME,
        email: `deleted-${userId}@deleted.invalid`,
        avatarKey: null,
        deletedAt: new Date(),
      })
      .where(eq(users.id, userId)),
  ]);
  if (avatarKey) {
    // The account is already gone; an orphaned object is not worth failing the request over.
    await bucket.delete(avatarKey).catch((error: unknown) => {
      console.error('failed to delete avatar of deleted user', { userId, avatarKey, error });
    });
  }
}
