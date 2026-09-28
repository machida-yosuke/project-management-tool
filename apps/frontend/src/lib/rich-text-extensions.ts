import type { Extensions, JSONContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import type { RichTextDoc, RichTextNode } from '@pm-tool/shared';
import { apiBaseUrl } from './api';

const HTTP_URL = /^https?:\/\//i;

export function isHttpUrl(value: string): boolean {
  return HTTP_URL.test(value);
}

// Stored attachment URLs are relative to the API origin, which differs from the page origin.
export function attachmentDisplaySrc(src: string): string {
  return src.startsWith('/api/') ? `${apiBaseUrl}${src}` : src;
}

function attachmentStoredSrc(src: string | null): string | null {
  if (src === null) return null;
  if (src.startsWith(`${apiBaseUrl}/api/`)) return src.slice(apiBaseUrl.length);
  return src.startsWith('data:') || src.startsWith('/api/') ? src : null;
}

const AttachmentImage = Image.extend({
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => attachmentStoredSrc(element.getAttribute('src')),
        renderHTML: (attrs) =>
          typeof attrs.src === 'string' ? { src: attachmentDisplaySrc(attrs.src) } : {},
      },
      alt: { default: null },
    };
  },
  parseHTML() {
    // Pasted HTML may carry external images the server would reject, so only keep ones we can upload or already own.
    return [
      {
        tag: 'img[src]',
        getAttrs: (element) => (attachmentStoredSrc(element.getAttribute('src')) ? null : false),
      },
    ];
  },
});

export function createRichTextExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      horizontalRule: false,
      underline: false,
      link: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      isAllowedUri: (url) => isHttpUrl(url),
      HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer', class: null },
    }),
    AttachmentImage.configure({ inline: true, allowBase64: true }),
  ];
}

// Tiptap always sets `type` on nodes it emits, so the looser JSONContent shape narrows safely.
export function jsonToRichTextDoc(json: JSONContent): RichTextDoc {
  if (json.type !== 'doc') throw new Error(`Expected a doc node, got ${String(json.type)}`);
  return { type: 'doc', content: (json.content ?? []) as RichTextNode[] };
}
