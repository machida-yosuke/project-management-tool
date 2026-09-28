export interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  text?: string;
}

export interface RichTextDoc {
  type: 'doc';
  content: RichTextNode[];
}

export const RICH_TEXT_MAX_BYTES = 65536;
export const RICH_TEXT_MAX_DEPTH = 20;

export type RichTextValidationReason =
  | 'invalid_doc'
  | 'invalid_node'
  | 'unknown_node'
  | 'unknown_key'
  | 'invalid_attrs'
  | 'invalid_child'
  | 'invalid_text'
  | 'invalid_image_src'
  | 'invalid_mark'
  | 'unknown_mark'
  | 'invalid_link_href'
  | 'too_deep'
  | 'too_large';

export type RichTextValidationResult =
  { ok: true; doc: RichTextDoc } | { ok: false; reason: RichTextValidationReason };

export interface RichTextValidationOptions {
  imageSrcPattern: RegExp;
}

type ChildKind = 'block' | 'inline' | 'listItem' | 'plainText' | 'none';

const NODE_CHILDREN: Record<string, ChildKind> = {
  paragraph: 'inline',
  heading: 'inline',
  bulletList: 'listItem',
  orderedList: 'listItem',
  listItem: 'block',
  blockquote: 'block',
  codeBlock: 'plainText',
  hardBreak: 'none',
  image: 'none',
};

const BLOCK_NODES = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock',
]);
const INLINE_NODES = new Set(['text', 'hardBreak', 'image']);

class RichTextError extends Error {
  constructor(readonly reason: RichTextValidationReason) {
    super(reason);
  }
}

function fail(reason: RichTextValidationReason): never {
  throw new RichTextError(reason);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertKeys(obj: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) fail('unknown_key');
  }
}

// Unknown and null attrs are dropped instead of rejected: Tiptap's getJSON() emits defaults such as
// codeBlock.language: null or link.class: null that the renderer never uses.
function readAttrs(
  node: Record<string, unknown>,
  allowed: readonly string[],
): Record<string, unknown> {
  if (node.attrs === undefined) return {};
  if (!isPlainObject(node.attrs)) fail('invalid_attrs');
  const attrs: Record<string, unknown> = {};
  for (const key of allowed) {
    const value = node.attrs[key];
    if (value !== null && value !== undefined) attrs[key] = value;
  }
  return attrs;
}

function isAllowedChild(kind: ChildKind, type: string): boolean {
  switch (kind) {
    case 'block':
      return BLOCK_NODES.has(type);
    case 'inline':
      return INLINE_NODES.has(type);
    case 'listItem':
      return type === 'listItem';
    case 'plainText':
      return type === 'text';
    case 'none':
      return false;
  }
}

function sanitizeMark(input: unknown): RichTextMark {
  if (!isPlainObject(input) || typeof input.type !== 'string') fail('invalid_mark');
  assertKeys(input, ['type', 'attrs']);
  switch (input.type) {
    case 'bold':
    case 'italic':
    case 'strike':
    case 'code':
      readAttrs(input, []);
      return { type: input.type };
    case 'link': {
      const { href } = readAttrs(input, ['href']);
      if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) fail('invalid_link_href');
      return { type: 'link', attrs: { href } };
    }
    default:
      fail('unknown_mark');
  }
}

function sanitizeText(input: Record<string, unknown>, allowMarks: boolean): RichTextNode {
  assertKeys(input, allowMarks ? ['type', 'text', 'marks'] : ['type', 'text']);
  if (typeof input.text !== 'string' || input.text.length === 0) fail('invalid_text');
  const node: RichTextNode = { type: 'text', text: input.text };
  if (input.marks !== undefined) {
    if (!Array.isArray(input.marks)) fail('invalid_mark');
    if (input.marks.length > 0) node.marks = input.marks.map(sanitizeMark);
  }
  return node;
}

function sanitizeNodeAttrs(
  type: string,
  input: Record<string, unknown>,
  options: RichTextValidationOptions,
): Record<string, unknown> | undefined {
  switch (type) {
    case 'heading': {
      const { level } = readAttrs(input, ['level']);
      if (level !== 1 && level !== 2 && level !== 3) fail('invalid_attrs');
      return { level };
    }
    case 'orderedList': {
      const { start } = readAttrs(input, ['start']);
      if (start === undefined) return undefined;
      if (typeof start !== 'number' || !Number.isInteger(start)) fail('invalid_attrs');
      return { start };
    }
    case 'image': {
      const { src, alt } = readAttrs(input, ['src', 'alt']);
      if (typeof src !== 'string' || src.search(options.imageSrcPattern) === -1) {
        fail('invalid_image_src');
      }
      if (alt === undefined) return { src };
      if (typeof alt !== 'string') fail('invalid_attrs');
      return { src, alt };
    }
    default:
      readAttrs(input, []);
      return undefined;
  }
}

function sanitizeNode(
  input: unknown,
  parentKind: ChildKind,
  depth: number,
  options: RichTextValidationOptions,
): RichTextNode {
  if (depth > RICH_TEXT_MAX_DEPTH) fail('too_deep');
  if (!isPlainObject(input) || typeof input.type !== 'string') fail('invalid_node');
  const { type } = input;
  if (type !== 'text' && !(type in NODE_CHILDREN)) fail('unknown_node');
  if (!isAllowedChild(parentKind, type)) fail('invalid_child');

  if (type === 'text') return sanitizeText(input, parentKind !== 'plainText');

  const childKind = NODE_CHILDREN[type] as ChildKind;
  assertKeys(input, childKind === 'none' ? ['type', 'attrs'] : ['type', 'attrs', 'content']);
  const node: RichTextNode = { type };
  const attrs = sanitizeNodeAttrs(type, input, options);
  if (attrs) node.attrs = attrs;
  if (input.content !== undefined) {
    if (!Array.isArray(input.content)) fail('invalid_node');
    if (input.content.length > 0) {
      node.content = input.content.map((child) =>
        sanitizeNode(child, childKind, depth + 1, options),
      );
    }
  }
  return node;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) as number;
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function validateRichTextDoc(
  input: unknown,
  options: RichTextValidationOptions,
): RichTextValidationResult {
  try {
    if (!isPlainObject(input) || input.type !== 'doc' || !Array.isArray(input.content)) {
      fail('invalid_doc');
    }
    assertKeys(input, ['type', 'content']);
    const doc: RichTextDoc = {
      type: 'doc',
      content: input.content.map((child) => sanitizeNode(child, 'block', 2, options)),
    };
    if (utf8ByteLength(JSON.stringify(doc)) > RICH_TEXT_MAX_BYTES) fail('too_large');
    return { ok: true, doc };
  } catch (error) {
    if (error instanceof RichTextError) return { ok: false, reason: error.reason };
    throw error;
  }
}

export function emptyRichTextDoc(): RichTextDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

export function plainTextToRichTextDoc(text: string): RichTextDoc {
  if (text === '') return emptyRichTextDoc();
  return {
    type: 'doc',
    content: text
      .split(/\r?\n/)
      .map((line) =>
        line === ''
          ? { type: 'paragraph' }
          : { type: 'paragraph', content: [{ type: 'text', text: line }] },
      ),
  };
}

function inlineToPlainText(node: RichTextNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'image') return '[画像]';
  return '';
}

function nodeToPlainText(node: RichTextNode): string {
  const children = node.content ?? [];
  if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'codeBlock') {
    return children.map(inlineToPlainText).join('');
  }
  return children.map(nodeToPlainText).join('\n');
}

export function richTextDocToPlainText(doc: RichTextDoc): string {
  return doc.content.map(nodeToPlainText).join('\n');
}

function hasVisibleContent(node: RichTextNode): boolean {
  if (node.type === 'image') return true;
  if (node.type === 'text') return (node.text ?? '').trim() !== '';
  return (node.content ?? []).some(hasVisibleContent);
}

export function isRichTextDocEmpty(doc: RichTextDoc): boolean {
  return !doc.content.some(hasVisibleContent);
}
