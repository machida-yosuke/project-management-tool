import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type {
  AccountDeletionBlocked,
  ProjectMember,
  Task,
  TaskComment,
  UserSummary,
} from '@pm-tool/shared';
import { createSession } from '../../src/auth/session';
import { upsertUserByEmail } from '../../src/auth/users';
import { projects } from '../../src/db/schema';
import { MAX_AVATAR_BYTES, MAX_AVATAR_DIMENSION } from '../../src/users/avatar';
import {
  addMember,
  api,
  createProjectAs,
  createUser,
  json,
  setupProject,
  type TestUser,
} from '../projects/helpers';
import { jpeg, padTo, png, webpLossless } from './images';

const PNG_BYTES = png(128, 128);

function avatarForm(bytes: Uint8Array, type: string): FormData {
  const form = new FormData();
  form.append('file', new File([bytes], 'avatar', { type }));
  return form;
}

function uploadAvatar(user: TestUser, bytes = PNG_BYTES, type = 'image/png') {
  return api(user, '/api/me/avatar', { method: 'PUT', body: avatarForm(bytes, type) });
}

function keyOf(avatarUrl: string): string {
  return avatarUrl.slice('/api/'.length);
}

describe('PATCH /api/me', () => {
  it('trims and saves the name, reflected by /api/auth/me', async () => {
    const user = await createUser('rename');
    const res = await api(user, '/api/me', { method: 'PATCH', body: { name: '  New Name ' } });
    expect(res.status).toBe(200);
    expect(await json<UserSummary>(res)).toEqual({
      id: user.id,
      email: user.email,
      name: 'New Name',
      avatarUrl: null,
    });

    const me = await json<UserSummary>(await api(user, '/api/auth/me'));
    expect(me.name).toBe('New Name');
  });

  it.each([[''], ['   '], ['a'.repeat(101)]])('rejects name %j', async (name) => {
    const user = await createUser('rename-invalid');
    const res = await api(user, '/api/me', { method: 'PATCH', body: { name } });
    expect(res.status).toBe(400);
    expect(await json<{ error: string }>(res)).toMatchObject({ error: 'validation_error' });
  });

  it('requires a session', async () => {
    expect((await api(null, '/api/me', { method: 'PATCH', body: { name: 'x' } })).status).toBe(401);
    expect((await api(null, '/api/me', { method: 'DELETE' })).status).toBe(401);
  });
});

describe('avatar', () => {
  it('uploads and serves the avatar with immutable caching', async () => {
    const user = await createUser('avatar');
    const res = await uploadAvatar(user);
    expect(res.status).toBe(200);
    const body = await json<UserSummary>(res);
    expect(body.avatarUrl).toMatch(
      new RegExp(
        `^/api/avatars/${user.id}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
      ),
    );
    const avatarUrl = body.avatarUrl ?? '';

    expect((await json<UserSummary>(await api(user, '/api/auth/me'))).avatarUrl).toBe(avatarUrl);

    const other = await createUser('viewer');
    const served = await api(other, avatarUrl);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG_BYTES);

    expect((await api(null, avatarUrl)).status).toBe(401);
  });

  it('exposes avatarUrl on project members', async () => {
    const owner = await createUser('member-avatar');
    const project = await createProjectAs(owner);
    const { avatarUrl } = await json<UserSummary>(await uploadAvatar(owner));
    const members = await json<ProjectMember[]>(
      await api(owner, `/api/projects/${project.id}/members`),
    );
    expect(members[0]?.avatarUrl).toBe(avatarUrl);
  });

  it('deletes the previous object when replaced', async () => {
    const user = await createUser('replace');
    const first = (await json<UserSummary>(await uploadAvatar(user))).avatarUrl ?? '';
    const second = await uploadAvatar(user, webpLossless(128, 128), 'image/webp');
    expect(second.status).toBe(200);
    const secondUrl = (await json<UserSummary>(second)).avatarUrl ?? '';

    expect(secondUrl).not.toBe(first);
    expect(await env.ATTACHMENTS.get(keyOf(first))).toBeNull();
    expect(await env.ATTACHMENTS.get(keyOf(secondUrl))).not.toBeNull();
    expect((await api(user, first)).status).toBe(404);
  });

  it('removes the avatar', async () => {
    const user = await createUser('remove');
    const url = (await json<UserSummary>(await uploadAvatar(user))).avatarUrl ?? '';
    const res = await api(user, '/api/me/avatar', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await json<UserSummary>(res)).avatarUrl).toBeNull();
    expect(await env.ATTACHMENTS.get(keyOf(url))).toBeNull();
  });

  it.each([
    ['just over the limit', MAX_AVATAR_BYTES + 1],
    ['far over the limit', MAX_AVATAR_BYTES * 2],
  ])('rejects a file %s with 413', async (_label, size) => {
    const user = await createUser('too-large');
    const res = await uploadAvatar(user, new Uint8Array(size));
    expect(res.status).toBe(413);
    expect(await json<{ error: string }>(res)).toEqual({ error: 'payload_too_large' });
  });

  it('accepts a file of exactly the limit', async () => {
    const user = await createUser('at-limit');
    expect((await uploadAvatar(user, padTo(PNG_BYTES, MAX_AVATAR_BYTES))).status).toBe(200);
  });

  it.each([
    ['PNG', png(MAX_AVATAR_DIMENSION, MAX_AVATAR_DIMENSION), 'image/png'],
    ['JPEG', jpeg(128, 128), 'image/jpeg'],
    ['WebP', webpLossless(128, 96), 'image/webp'],
  ])('accepts a small %s and stores it as sent', async (_label, bytes, type) => {
    const user = await createUser('small-image');
    const res = await uploadAvatar(user, bytes, type);
    expect(res.status).toBe(200);
    const stored = await env.ATTACHMENTS.get(keyOf((await json<UserSummary>(res)).avatarUrl ?? ''));
    expect(stored?.httpMetadata?.contentType).toBe(type);
    expect(new Uint8Array((await stored?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(bytes);
  });

  it.each([
    ['too wide', png(MAX_AVATAR_DIMENSION + 1, 1), 'image/png'],
    ['too tall', jpeg(1, MAX_AVATAR_DIMENSION + 1), 'image/jpeg'],
    ['not an image', new TextEncoder().encode('hello'), 'image/png'],
  ])('rejects an image that is %s with 400 image_too_large', async (_label, bytes, type) => {
    const user = await createUser('oversized-image');
    const res = await uploadAvatar(user, bytes, type);
    expect(res.status).toBe(400);
    expect(await json<{ error: string }>(res)).toEqual({ error: 'image_too_large' });
    expect((await json<UserSummary>(await api(user, '/api/auth/me'))).avatarUrl).toBeNull();
  });

  it('rejects unsupported types and missing files with 400', async () => {
    const user = await createUser('bad-type');
    const svg = await uploadAvatar(
      user,
      new Uint8Array(new TextEncoder().encode('<svg/>')),
      'image/svg+xml',
    );
    expect(svg.status).toBe(400);
    expect(await json<{ error: string }>(svg)).toEqual({ error: 'unsupported_media_type' });

    const gif = await uploadAvatar(user, new TextEncoder().encode('GIF89a'), 'image/gif');
    expect(gif.status).toBe(400);
    expect(await json<{ error: string }>(gif)).toEqual({ error: 'unsupported_media_type' });

    const missing = await api(user, '/api/me/avatar', { method: 'PUT', body: new FormData() });
    expect(missing.status).toBe(400);
  });
});

describe('DELETE /api/me', () => {
  it('refuses while an owned project has other members', async () => {
    const { project, admin } = await setupProject();
    await createProjectAs(admin, 'Solo');
    const res = await api(admin, '/api/me', { method: 'DELETE' });
    expect(res.status).toBe(409);
    expect(await json<AccountDeletionBlocked>(res)).toEqual({
      error: 'owned_projects_have_members',
      projects: [{ id: project.id, name: project.name }],
    });
    expect((await api(admin, '/api/auth/me')).status).toBe(200);
  });

  it('deletes the account, its solo projects and every session', async () => {
    const user = await createUser('leaver');
    const solo = await createProjectAs(user, 'Solo');
    const otherSession = `session_id=${await createSession(env.SESSIONS, user)}`;

    const res = await api(user, '/api/me', { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toMatch(/^session_id=;/);

    expect((await api(user, '/api/auth/me')).status).toBe(401);
    expect((await api({ ...user, cookie: otherSession }, '/api/projects')).status).toBe(401);

    const rows = await drizzle(env.DB).select().from(projects).where(eq(projects.id, solo.id));
    expect(rows).toEqual([]);
    const stranger = await createUser('stranger');
    expect((await api(stranger, `/api/projects/${solo.id}`)).status).toBe(404);
  });

  it('keeps tasks and comments, attributed to an anonymised user', async () => {
    const { project, admin, staff } = await setupProject();
    const avatarUrl = (await json<UserSummary>(await uploadAvatar(staff))).avatarUrl ?? '';
    const base = `/api/projects/${project.id}/tasks`;
    const task = await json<Task>(
      await api(staff, base, { method: 'POST', body: { title: 'T', assigneeId: staff.id } }),
    );
    await api(staff, `${base}/${task.id}/comments`, { method: 'POST', body: { body: 'hi' } });

    expect((await api(staff, '/api/me', { method: 'DELETE' })).status).toBe(204);

    const [seen] = await json<Task[]>(await api(admin, base));
    expect(seen?.assignee).toBeNull();
    expect(seen?.createdBy).toEqual({
      id: staff.id,
      email: `deleted-${staff.id}@deleted.invalid`,
      name: '退会したユーザー',
      avatarUrl: null,
    });
    const [comment] = await json<TaskComment[]>(await api(admin, `${base}/${task.id}/comments`));
    expect(comment?.author.name).toBe('退会したユーザー');

    const members = await json<ProjectMember[]>(
      await api(admin, `/api/projects/${project.id}/members`),
    );
    expect(members.map((m) => m.userId)).not.toContain(staff.id);
    expect(await env.ATTACHMENTS.get(keyOf(avatarUrl))).toBeNull();
  });

  it('creates a fresh user when the same email signs in again', async () => {
    const user = await createUser('returning');
    const owner = await createUser('owner');
    const project = await createProjectAs(owner);
    await addMember(owner, project.id, user, 'staff');
    expect((await api(user, '/api/me', { method: 'DELETE' })).status).toBe(204);

    const again = await upsertUserByEmail(env.DB, { email: user.email, name: 'Back' });
    expect(again.id).not.toBe(user.id);
    expect(again.name).toBe('Back');
  });
});
