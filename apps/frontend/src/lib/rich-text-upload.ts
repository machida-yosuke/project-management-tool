import {
  validateRichTextDoc,
  type RichTextDoc,
  type RichTextNode,
  type RichTextValidationReason,
} from '@pm-tool/shared';
import { uploadAttachment } from '../api/generated';
import { errorMessage } from './api';
import { dataUrlToBlob } from './image';

export type PrepareRichTextError =
  { kind: 'upload'; cause: unknown } | { kind: 'invalid'; reason: RichTextValidationReason };

// `draft` is the editor doc with every uploaded image already swapped in, so a retry never re-uploads.
export type PrepareRichTextResult =
  | { ok: true; doc: RichTextDoc; draft: RichTextDoc }
  | { ok: false; error: PrepareRichTextError; draft: RichTextDoc };

const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function attachmentSrcPattern(projectId: string): RegExp {
  return new RegExp(`^/api/projects/${escapeRegExp(projectId)}/attachments/[0-9a-f-]{36}$`);
}

function isDataImage(node: RichTextNode): boolean {
  return node.type === 'image' && typeof node.attrs?.src === 'string'
    ? node.attrs.src.startsWith('data:')
    : false;
}

function hasDataImage(nodes: readonly RichTextNode[]): boolean {
  return nodes.some((node) => isDataImage(node) || hasDataImage(node.content ?? []));
}

function toFile(blob: Blob): File {
  const extension = EXTENSIONS[blob.type] ?? 'bin';
  // Wrap in a File rather than passing append's filename argument, which happy-dom ignores for Blobs.
  return new File([blob], `attachment.${extension}`, { type: blob.type });
}

async function uploadNodes(
  projectId: string,
  nodes: readonly RichTextNode[],
): Promise<{ nodes: RichTextNode[]; error: unknown }> {
  const result: RichTextNode[] = [];
  let error: unknown = null;
  for (const node of nodes) {
    if (error !== null) {
      result.push(node);
    } else if (isDataImage(node)) {
      const src = String(node.attrs?.src);
      try {
        const attachment = await uploadAttachment(projectId, { file: toFile(dataUrlToBlob(src)) });
        result.push({ ...node, attrs: { ...node.attrs, src: attachment.url } });
      } catch (e) {
        error = e;
        result.push(node);
      }
    } else if (node.content && hasDataImage(node.content)) {
      const child = await uploadNodes(projectId, node.content);
      error = child.error;
      result.push({ ...node, content: child.nodes });
    } else {
      result.push(node);
    }
  }
  return { nodes: result, error };
}

// Matches nothing: without a project there is nowhere to upload to or own attachments in.
const NO_IMAGE_SRC = /(?!)/;

export async function prepareRichTextDoc(
  projectId: string | null,
  doc: RichTextDoc,
): Promise<PrepareRichTextResult> {
  let draft = doc;
  if (projectId !== null && hasDataImage(doc.content)) {
    const uploaded = await uploadNodes(projectId, doc.content);
    draft = { type: 'doc', content: uploaded.nodes };
    if (uploaded.error !== null)
      return { ok: false, error: { kind: 'upload', cause: uploaded.error }, draft };
  }
  const result = validateRichTextDoc(draft, {
    imageSrcPattern: projectId === null ? NO_IMAGE_SRC : attachmentSrcPattern(projectId),
  });
  if (!result.ok) return { ok: false, error: { kind: 'invalid', reason: result.reason }, draft };
  return { ok: true, doc: result.doc, draft };
}

const INVALID_MESSAGES: Partial<Record<RichTextValidationReason, string>> = {
  too_large: '本文が大きすぎます',
  too_deep: '入れ子が深すぎます',
  invalid_image_src: '使用できない画像が含まれています',
  invalid_link_href: 'リンクは http:// か https:// で始まる URL にしてください',
};

export function prepareErrorMessage(error: PrepareRichTextError): string {
  if (error.kind === 'invalid') {
    return INVALID_MESSAGES[error.reason] ?? '本文の形式が正しくありません';
  }
  return errorMessage(
    error.cause,
    {
      payload_too_large: '画像が大きすぎます',
      image_too_large: '画像が大きすぎます',
      unsupported_media_type: '対応していない画像形式です',
    },
    '画像のアップロードに失敗しました',
  );
}
