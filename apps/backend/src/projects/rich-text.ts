import { HTTPException } from 'hono/http-exception';
import {
  isRichTextDocEmpty,
  plainTextToRichTextDoc,
  validateRichTextDoc,
  type RichTextDoc,
} from '@pm-tool/shared';
import { attachmentSrcPattern } from './attachments';

function richTextError(field: string, message: string): HTTPException {
  const body = {
    error: 'validation_error',
    issues: [{ code: 'custom', path: [field], message }],
  };
  return new HTTPException(400, { res: Response.json(body, { status: 400 }) });
}

// Returns the normalized document as the JSON string to store.
export function serializeRichText(
  input: unknown,
  projectId: string,
  field: string,
  options: { allowEmpty: boolean },
): string {
  const result = validateRichTextDoc(input, { imageSrcPattern: attachmentSrcPattern(projectId) });
  if (!result.ok) throw richTextError(field, result.reason);
  if (!options.allowEmpty && isRichTextDocEmpty(result.doc)) throw richTextError(field, 'empty');
  return JSON.stringify(result.doc);
}

function parseJson(stored: string): unknown {
  try {
    return JSON.parse(stored);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

// Rows written before rich text hold plain text, which is shown as one paragraph per line.
export function deserializeRichText(stored: string, projectId: string): RichTextDoc {
  const result = validateRichTextDoc(parseJson(stored), {
    imageSrcPattern: attachmentSrcPattern(projectId),
  });
  return result.ok ? result.doc : plainTextToRichTextDoc(stored);
}
