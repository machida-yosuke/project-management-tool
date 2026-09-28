import { describe, expect, it } from 'vitest';
import type { RichTextDoc } from '@pm-tool/shared';
import type { Attachment } from '../../src/api/generated/models';
import { prepareErrorMessage, prepareRichTextDoc } from '../../src/lib/rich-text-upload';
import { json, stubApi } from '../helpers/api-mock';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';
const WEBP_DATA_URL = 'data:image/webp;base64,UklGRg==';
const ID_1 = '11111111-1111-1111-1111-111111111111';
const ID_2 = '22222222-2222-2222-2222-222222222222';

function attachment(id: string): Attachment {
  return {
    id,
    url: `/api/projects/p1/attachments/${id}`,
    contentType: 'image/webp',
    size: 10,
    width: 1,
    height: 1,
    createdAt: '2026-09-28T00:00:00.000Z',
  };
}

function image(src: string) {
  return { type: 'image', attrs: { src, alt: null, title: null } };
}

function docWith(...srcs: string[]): RichTextDoc {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'see' }, ...srcs.slice(0, 1).map(image)],
      },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: srcs.slice(1).map(image) }] },
        ],
      },
    ],
  };
}

function uploads(ids: string[]) {
  const files: File[] = [];
  const queue = [...ids];
  const handler = (body: unknown) => {
    const file = body instanceof FormData ? body.get('file') : null;
    if (!(file instanceof File)) throw new Error('expected a file field');
    files.push(file);
    const id = queue.shift();
    return id ? json(attachment(id), 201) : json({ error: 'image_too_large' }, 400);
  };
  return { files, handler };
}

describe('prepareRichTextDoc', () => {
  it('uploads every data URL image and swaps in the attachment URL', async () => {
    const { files, handler } = uploads([ID_1, ID_2]);
    const requests = stubApi({ 'POST /api/projects/p1/attachments': handler });

    const result = await prepareRichTextDoc('p1', docWith(PNG_DATA_URL, WEBP_DATA_URL));

    expect(requests).toHaveBeenCalledTimes(2);
    expect(files.map((f) => [f.name, f.type])).toEqual([
      ['attachment.png', 'image/png'],
      ['attachment.webp', 'image/webp'],
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = docWith(
      `/api/projects/p1/attachments/${ID_1}`,
      `/api/projects/p1/attachments/${ID_2}`,
    );
    expect(result.draft).toEqual(expected);
    // The validated doc drops Tiptap's null attrs.
    expect(result.doc.content[0]?.content?.[1]).toEqual({
      type: 'image',
      attrs: { src: `/api/projects/p1/attachments/${ID_1}` },
    });
  });

  it('stops at the first failed upload and keeps earlier results for a retry', async () => {
    const { handler } = uploads([ID_1]);
    const requests = stubApi({ 'POST /api/projects/p1/attachments': handler });
    const doc = docWith(PNG_DATA_URL, WEBP_DATA_URL, PNG_DATA_URL);

    const result = await prepareRichTextDoc('p1', doc);

    expect(requests).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(prepareErrorMessage(result.error)).toBe('画像が大きすぎます');
    expect(result.draft).toEqual(
      docWith(`/api/projects/p1/attachments/${ID_1}`, WEBP_DATA_URL, PNG_DATA_URL),
    );
  });

  it('leaves non-data sources untouched and sends nothing for them', async () => {
    const requests = stubApi({});
    const doc = docWith(`/api/projects/p1/attachments/${ID_1}`);

    const result = await prepareRichTextDoc('p1', doc);

    expect(requests).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.draft).toBe(doc);
  });

  it('rejects images that point outside the project without uploading them', async () => {
    const requests = stubApi({});

    const external = await prepareRichTextDoc('p1', docWith('https://evil.example/x.png'));
    const otherProject = await prepareRichTextDoc(
      'p1',
      docWith(`/api/projects/p2/attachments/${ID_1}`),
    );

    expect(requests).not.toHaveBeenCalled();
    for (const result of [external, otherProject]) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toEqual({ kind: 'invalid', reason: 'invalid_image_src' });
      expect(prepareErrorMessage(result.error)).toBe('使用できない画像が含まれています');
    }
  });

  it('escapes the project id in the allowed image pattern', async () => {
    stubApi({});

    const result = await prepareRichTextDoc(
      'p.1',
      docWith(`/api/projects/px1/attachments/${ID_1}`),
    );

    expect(result.ok).toBe(false);
  });
});
