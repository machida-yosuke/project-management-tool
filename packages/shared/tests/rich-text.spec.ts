import { describe, expect, it } from 'vitest';
import {
  RICH_TEXT_MAX_BYTES,
  emptyRichTextDoc,
  isRichTextDocEmpty,
  plainTextToRichTextDoc,
  richTextDocToPlainText,
  validateRichTextDoc,
  type RichTextDoc,
} from '../src/rich-text';

const PROJECT_ID = 'p1';
const ATTACHMENT_ID = '5f0c8e2a-7c1d-4b8e-9a3f-2d1e0c9b8a76';
const IMAGE_SRC = `/api/projects/${PROJECT_ID}/attachments/${ATTACHMENT_ID}`;
const options = {
  imageSrcPattern: new RegExp(`^/api/projects/${PROJECT_ID}/attachments/[0-9a-f-]{36}$`),
};

function doc(...content: unknown[]): unknown {
  return { type: 'doc', content };
}

function paragraph(...content: unknown[]): unknown {
  return { type: 'paragraph', content };
}

function text(value: string, marks?: unknown[]): unknown {
  return marks ? { type: 'text', text: value, marks } : { type: 'text', text: value };
}

function reasonOf(input: unknown): string | undefined {
  const result = validateRichTextDoc(input, options);
  return result.ok ? undefined : result.reason;
}

describe('validateRichTextDoc', () => {
  it('accepts a document using every allowed node and mark', () => {
    const input = doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('Title')] },
      paragraph(
        text('bold', [{ type: 'bold' }]),
        text('italic', [{ type: 'italic' }, { type: 'strike' }]),
        text('code', [{ type: 'code' }]),
        text('link', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
        { type: 'hardBreak' },
        { type: 'image', attrs: { src: IMAGE_SRC, alt: 'screenshot' } },
      ),
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [paragraph(text('a'))] }],
      },
      {
        type: 'orderedList',
        attrs: { start: 3 },
        content: [
          {
            type: 'listItem',
            content: [
              paragraph(text('b')),
              {
                type: 'bulletList',
                content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
              },
            ],
          },
        ],
      },
      { type: 'blockquote', content: [paragraph(text('quote'))] },
      { type: 'codeBlock', content: [text('const a = 1;')] },
      { type: 'paragraph' },
    );

    const result = validateRichTextDoc(input, options);

    expect(result).toEqual({ ok: true, doc: input });
  });

  it('accepts the empty document', () => {
    expect(validateRichTextDoc(emptyRichTextDoc(), options)).toEqual({
      ok: true,
      doc: emptyRichTextDoc(),
    });
  });

  it('drops target and rel from link marks', () => {
    const input = doc(
      paragraph(
        text('link', [
          {
            type: 'link',
            attrs: { href: 'http://example.com', target: '_blank', rel: 'noopener' },
          },
        ]),
      ),
    );

    const result = validateRichTextDoc(input, options);

    expect(result).toEqual({
      ok: true,
      doc: doc(paragraph(text('link', [{ type: 'link', attrs: { href: 'http://example.com' } }]))),
    });
  });

  it.each([
    ['null', null],
    ['a string', 'hello'],
    ['a non-doc root', { type: 'paragraph', content: [] }],
    ['a doc without content', { type: 'doc' }],
  ])('rejects %s as invalid_doc', (_, input) => {
    expect(reasonOf(input)).toBe('invalid_doc');
  });

  it('rejects unknown keys on the doc', () => {
    expect(reasonOf({ type: 'doc', content: [], extra: 1 })).toBe('unknown_key');
  });

  it('rejects unknown keys on nodes', () => {
    expect(reasonOf(doc({ type: 'paragraph', content: [], marks: [] }))).toBe('unknown_key');
    expect(reasonOf(doc(paragraph({ type: 'text', text: 'a', attrs: {} })))).toBe('unknown_key');
    expect(reasonOf(doc(paragraph({ type: 'hardBreak', content: [] })))).toBe('unknown_key');
  });

  it('rejects unknown node types', () => {
    expect(reasonOf(doc({ type: 'horizontalRule' }))).toBe('unknown_node');
    expect(reasonOf(doc({ type: 'doc', content: [] }))).toBe('unknown_node');
  });

  it('rejects non-object nodes', () => {
    expect(reasonOf(doc('text'))).toBe('invalid_node');
    expect(reasonOf(doc({ content: [] }))).toBe('invalid_node');
    expect(reasonOf(doc({ type: 'paragraph', content: 'a' }))).toBe('invalid_node');
  });

  it.each([
    ['text directly under doc', doc(text('a'))],
    ['a listItem directly under doc', doc({ type: 'listItem', content: [paragraph()] })],
    ['a paragraph directly under a list', doc({ type: 'bulletList', content: [paragraph()] })],
    ['a block inside a paragraph', doc(paragraph(paragraph()))],
    ['an image at block level', doc({ type: 'image', attrs: { src: IMAGE_SRC } })],
    [
      'a hardBreak inside a codeBlock',
      doc({ type: 'codeBlock', content: [{ type: 'hardBreak' }] }),
    ],
  ])('rejects %s as invalid_child', (_, input) => {
    expect(reasonOf(input)).toBe('invalid_child');
  });

  it('rejects marks inside a codeBlock', () => {
    expect(reasonOf(doc({ type: 'codeBlock', content: [text('a', [{ type: 'bold' }])] }))).toBe(
      'unknown_key',
    );
  });

  it.each([
    ['heading level 4', doc({ type: 'heading', attrs: { level: 4 }, content: [] })],
    ['heading without level', doc({ type: 'heading', content: [] })],
    ['heading with a null level', doc({ type: 'heading', attrs: { level: null }, content: [] })],
    ['a non-integer ordered list start', doc({ type: 'orderedList', attrs: { start: '1' } })],
    ['attrs that are not an object', doc({ type: 'paragraph', attrs: [] })],
    ['mark attrs that are not an object', doc(paragraph(text('a', [{ type: 'bold', attrs: 1 }])))],
    [
      'a non-string image alt',
      doc(paragraph({ type: 'image', attrs: { src: IMAGE_SRC, alt: 1 } })),
    ],
  ])('rejects %s as invalid_attrs', (_, input) => {
    expect(reasonOf(input)).toBe('invalid_attrs');
  });

  it('drops unknown and null attrs emitted by Tiptap', () => {
    const input = doc(
      { type: 'paragraph', attrs: { textAlign: 'left' }, content: [text('p')] },
      { type: 'heading', attrs: { level: 1, id: null }, content: [text('h')] },
      {
        type: 'orderedList',
        attrs: { start: 1, type: null },
        content: [{ type: 'listItem', content: [paragraph(text('o'))] }],
      },
      {
        type: 'orderedList',
        attrs: { start: null },
        content: [{ type: 'listItem', content: [paragraph(text('n'))] }],
      },
      { type: 'codeBlock', attrs: { language: null }, content: [text('c')] },
      paragraph(
        { type: 'image', attrs: { src: IMAGE_SRC, alt: null, title: null } },
        text('b', [{ type: 'bold', attrs: { x: 1 } }]),
        text('l', [
          {
            type: 'link',
            attrs: { href: 'https://a.b', target: '_blank', rel: 'noopener', class: null },
          },
        ]),
      ),
    );

    const result = validateRichTextDoc(input, options);

    expect(result).toEqual({
      ok: true,
      doc: doc(
        paragraph(text('p')),
        { type: 'heading', attrs: { level: 1 }, content: [text('h')] },
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [{ type: 'listItem', content: [paragraph(text('o'))] }],
        },
        {
          type: 'orderedList',
          content: [{ type: 'listItem', content: [paragraph(text('n'))] }],
        },
        { type: 'codeBlock', content: [text('c')] },
        paragraph(
          { type: 'image', attrs: { src: IMAGE_SRC } },
          text('b', [{ type: 'bold' }]),
          text('l', [{ type: 'link', attrs: { href: 'https://a.b' } }]),
        ),
      ),
    });
  });

  it('checks known attrs after dropping null values', () => {
    expect(reasonOf(doc(paragraph({ type: 'image', attrs: { src: null } })))).toBe(
      'invalid_image_src',
    );
    expect(reasonOf(doc(paragraph(text('a', [{ type: 'link', attrs: { href: null } }]))))).toBe(
      'invalid_link_href',
    );
  });

  it.each([
    ['an empty text node', doc(paragraph(text('')))],
    ['a text node without text', doc(paragraph({ type: 'text' }))],
  ])('rejects %s as invalid_text', (_, input) => {
    expect(reasonOf(input)).toBe('invalid_text');
  });

  it.each([
    ['a data URL', 'data:image/png;base64,AAAA'],
    ['an external URL', 'https://example.com/a.png'],
    ['another project attachment', `/api/projects/p2/attachments/${ATTACHMENT_ID}`],
    ['a missing src', undefined],
  ])('rejects %s as invalid_image_src', (_, src) => {
    expect(reasonOf(doc(paragraph({ type: 'image', attrs: { src } })))).toBe('invalid_image_src');
  });

  it('rejects unknown marks', () => {
    expect(reasonOf(doc(paragraph(text('a', [{ type: 'underline' }]))))).toBe('unknown_mark');
  });

  it('rejects malformed marks', () => {
    expect(reasonOf(doc(paragraph(text('a', [{}]))))).toBe('invalid_mark');
    expect(reasonOf(doc(paragraph({ type: 'text', text: 'a', marks: 'bold' })))).toBe(
      'invalid_mark',
    );
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['a relative URL', '/projects'],
    ['a missing href', undefined],
  ])('rejects a link with %s as invalid_link_href', (_, href) => {
    expect(reasonOf(doc(paragraph(text('a', [{ type: 'link', attrs: { href } }]))))).toBe(
      'invalid_link_href',
    );
  });

  function nestedBlockquotes(levels: number): unknown {
    let node: unknown = paragraph(text('deep'));
    for (let i = 0; i < levels; i++) node = { type: 'blockquote', content: [node] };
    return doc(node);
  }

  it('accepts nesting up to depth 20 including the doc', () => {
    expect(validateRichTextDoc(nestedBlockquotes(17), options).ok).toBe(true);
  });

  it('rejects nesting deeper than 20 as too_deep', () => {
    expect(reasonOf(nestedBlockquotes(18))).toBe('too_deep');
  });

  it('rejects documents over the byte limit as too_large', () => {
    const chunk = 'あ'.repeat(1000);
    const paragraphs = Array.from({ length: Math.ceil(RICH_TEXT_MAX_BYTES / 3000) + 1 }, () =>
      paragraph(text(chunk)),
    );
    expect(reasonOf(doc(...paragraphs))).toBe('too_large');
  });

  it('measures the size in UTF-8 bytes rather than string length', () => {
    const overhead = JSON.stringify(doc(paragraph(text('')))).length;
    const fitsAsUtf16 = 'あ'.repeat(Math.floor((RICH_TEXT_MAX_BYTES - overhead) / 2));
    expect(reasonOf(doc(paragraph(text(fitsAsUtf16))))).toBe('too_large');
  });
});

describe('plainTextToRichTextDoc', () => {
  it('returns the empty document for an empty string', () => {
    expect(plainTextToRichTextDoc('')).toEqual(emptyRichTextDoc());
  });

  it('splits lines into paragraphs and keeps blank lines as empty paragraphs', () => {
    expect(plainTextToRichTextDoc('first\r\n\nsecond')).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
      ],
    });
  });

  it('produces a document that passes validation', () => {
    expect(validateRichTextDoc(plainTextToRichTextDoc('a\n\nb'), options).ok).toBe(true);
  });
});

describe('richTextDocToPlainText', () => {
  it('round-trips plain text', () => {
    expect(richTextDocToPlainText(plainTextToRichTextDoc('a\n\nb'))).toBe('a\n\nb');
  });

  it('returns an empty string for the empty document', () => {
    expect(richTextDocToPlainText(emptyRichTextDoc())).toBe('');
  });

  it('joins inline text, breaks lines between blocks and replaces images', () => {
    const input = doc(
      { type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
      paragraph(text('a', [{ type: 'bold' }]), text('b'), { type: 'hardBreak' }, text('c')),
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph(text('one'))] },
          { type: 'listItem', content: [paragraph(text('two'))] },
        ],
      },
      paragraph({ type: 'image', attrs: { src: IMAGE_SRC } }),
    ) as RichTextDoc;

    expect(richTextDocToPlainText(input)).toBe('Title\nab\nc\none\ntwo\n[画像]');
  });
});

describe('isRichTextDocEmpty', () => {
  it('treats the empty document as empty', () => {
    expect(isRichTextDocEmpty(emptyRichTextDoc())).toBe(true);
  });

  it('treats whitespace-only text and empty structures as empty', () => {
    const input = doc(paragraph(text('  '), { type: 'hardBreak' }), {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [paragraph()] }],
    }) as RichTextDoc;
    expect(isRichTextDocEmpty(input)).toBe(true);
  });

  it('treats a document with text as non-empty', () => {
    expect(isRichTextDocEmpty(plainTextToRichTextDoc(' a '))).toBe(false);
  });

  it('treats a document with only an image as non-empty', () => {
    const input = doc(paragraph({ type: 'image', attrs: { src: IMAGE_SRC } })) as RichTextDoc;
    expect(isRichTextDocEmpty(input)).toBe(false);
  });
});
