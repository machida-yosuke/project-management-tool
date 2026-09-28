import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_DIMENSION } from '../../src/projects/attachments';
import type { Attachment } from '../../src/projects/attachments';
import { jpeg, padTo, png, webpLossless } from '../users/images';
import { api, json, setupProject, type TestUser } from './helpers';

function upload(user: TestUser, projectId: string, bytes: Uint8Array, type: string) {
  const form = new FormData();
  form.append('file', new File([bytes], 'image', { type }));
  return api(user, `/api/projects/${projectId}/attachments`, { method: 'POST', body: form });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('attachments', () => {
  it.each([
    ['PNG', png(MAX_ATTACHMENT_DIMENSION, 300), 'image/png'],
    ['JPEG', jpeg(640, 480), 'image/jpeg'],
    ['WebP', webpLossless(800, MAX_ATTACHMENT_DIMENSION), 'image/webp'],
  ])('uploads a %s and serves it to members', async (_label, bytes, type) => {
    const { project, staff, substaff } = await setupProject();
    const res = await upload(staff, project.id, bytes, type);
    expect(res.status).toBe(201);
    const attachment = await json<Attachment>(res);
    expect(attachment.id).toMatch(UUID);
    const [width, height] =
      type === 'image/png'
        ? [MAX_ATTACHMENT_DIMENSION, 300]
        : type === 'image/jpeg'
          ? [640, 480]
          : [800, MAX_ATTACHMENT_DIMENSION];
    expect(attachment).toEqual({
      id: attachment.id,
      url: `/api/projects/${project.id}/attachments/${attachment.id}`,
      contentType: type,
      size: bytes.byteLength,
      width,
      height,
      createdAt: new Date(attachment.createdAt).toISOString(),
    });

    const stored = await env.ATTACHMENTS.get(`attachments/${project.id}/${attachment.id}`);
    expect(stored?.httpMetadata?.contentType).toBe(type);

    const served = await api(substaff, attachment.url);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe(type);
    expect(served.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    expect(served.headers.get('etag')).toBeTruthy();
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
  });

  it('can be referenced from a task description', async () => {
    const { project, admin } = await setupProject();
    const attachment = await json<Attachment>(
      await upload(admin, project.id, png(10, 10), 'image/png'),
    );
    const description = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'image', attrs: { src: attachment.url } }] },
      ],
    };
    const res = await api(admin, `/api/projects/${project.id}/tasks`, {
      method: 'POST',
      body: { title: 'T', description },
    });
    expect(res.status).toBe(201);
  });

  it('forbids substaff and hides the project from non-members', async () => {
    const { project, substaff, outsider } = await setupProject();
    const bySubstaff = await upload(substaff, project.id, png(10, 10), 'image/png');
    expect(bySubstaff.status).toBe(403);
    expect(await bySubstaff.json()).toEqual({ error: 'forbidden' });

    const byOutsider = await upload(outsider, project.id, png(10, 10), 'image/png');
    expect(byOutsider.status).toBe(404);
    expect(await byOutsider.json()).toEqual({ error: 'not_found' });
  });

  it.each([
    ['just over the limit', MAX_ATTACHMENT_BYTES + 1],
    ['far over the limit', MAX_ATTACHMENT_BYTES * 2],
  ])('rejects a file %s with 413', async (_label, size) => {
    const { project, admin } = await setupProject();
    const res = await upload(admin, project.id, padTo(png(10, 10), size), 'image/png');
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'payload_too_large' });
  });

  it('accepts a file of exactly the limit', async () => {
    const { project, admin } = await setupProject();
    const res = await upload(
      admin,
      project.id,
      padTo(png(10, 10), MAX_ATTACHMENT_BYTES),
      'image/png',
    );
    expect(res.status).toBe(201);
  });

  it('rejects unsupported types and missing files with 400', async () => {
    const { project, admin } = await setupProject();
    for (const [bytes, type] of [
      [new TextEncoder().encode('<svg/>'), 'image/svg+xml'],
      [new TextEncoder().encode('GIF89a'), 'image/gif'],
    ] as const) {
      const res = await upload(admin, project.id, bytes, type);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'unsupported_media_type' });
    }

    const missing = await api(admin, `/api/projects/${project.id}/attachments`, {
      method: 'POST',
      body: new FormData(),
    });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'file_required' });
  });

  it.each([
    ['too wide', png(MAX_ATTACHMENT_DIMENSION + 1, 1), 'image/png'],
    ['too tall', jpeg(1, MAX_ATTACHMENT_DIMENSION + 1), 'image/jpeg'],
    ['not an image', new TextEncoder().encode('hello'), 'image/webp'],
  ])('rejects an image that is %s with 400 image_too_large', async (_label, bytes, type) => {
    const { project, admin } = await setupProject();
    const res = await upload(admin, project.id, bytes, type);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'image_too_large' });
  });

  it('returns 404 to non-members, for unknown ids and for other projects', async () => {
    const { project, admin, outsider } = await setupProject();
    const attachment = await json<Attachment>(
      await upload(admin, project.id, png(10, 10), 'image/png'),
    );

    const byOutsider = await api(outsider, attachment.url);
    expect(byOutsider.status).toBe(404);
    expect(await byOutsider.json()).toEqual({ error: 'not_found' });

    const unknown = await api(
      admin,
      `/api/projects/${project.id}/attachments/${crypto.randomUUID()}`,
    );
    expect(unknown.status).toBe(404);

    const other = await setupProject();
    const crossProject = await api(
      other.admin,
      `/api/projects/${other.project.id}/attachments/${attachment.id}`,
    );
    expect(crossProject.status).toBe(404);

    expect((await api(null, attachment.url)).status).toBe(401);
  });

  it('rejects a malformed file id with 400', async () => {
    const { project, admin } = await setupProject();
    const res = await api(admin, `/api/projects/${project.id}/attachments/not-a-uuid`);
    expect(res.status).toBe(400);
  });
});
