import { onScopeDispose, ref, shallowRef, watch } from 'vue';
import { isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';

const SAVE_DELAY_MS = 300;

export class DraftQuotaError extends Error {
  constructor(options?: ErrorOptions) {
    super('Draft storage quota exceeded', options);
    this.name = 'DraftQuotaError';
  }
}

export const draftKeys = {
  description: (taskId: string) => `draft:${taskId}:description`,
  newComment: (taskId: string) => `draft:${taskId}:comment:new`,
  comment: (taskId: string, commentId: string) => `draft:${taskId}:comment:${commentId}`,
};

function isQuotaExceeded(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  if ('name' in e && e.name === 'QuotaExceededError') return true;
  return 'code' in e && (e.code === 22 || e.code === 1014);
}

function isRichTextDocShape(value: unknown): value is RichTextDoc {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'doc' &&
    'content' in value &&
    Array.isArray(value.content)
  );
}

// Drafts are best-effort: storage can be disabled or corrupted, and editing must keep working without it.
export function loadDraft(key: string): RichTextDoc | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRichTextDocShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, doc: RichTextDoc): void {
  try {
    localStorage.setItem(key, JSON.stringify(doc));
  } catch (e) {
    if (isQuotaExceeded(e)) throw new DraftQuotaError({ cause: e });
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Same best-effort policy as loadDraft.
  }
}

export function useDraft(key: string, initial: () => RichTextDoc) {
  // shallowRef keeps the editor's own emitted object identity, so it can tell echoes from external changes.
  const doc = shallowRef<RichTextDoc>(loadDraft(key) ?? initial());
  const quotaExceeded = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function persist(value: RichTextDoc) {
    try {
      if (isRichTextDocEmpty(value)) clearDraft(key);
      else saveDraft(key, value);
      quotaExceeded.value = false;
    } catch (e) {
      if (!(e instanceof DraftQuotaError)) throw e;
      quotaExceeded.value = true;
    }
  }

  function cancelPending() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  watch(doc, (value) => {
    cancelPending();
    timer = setTimeout(() => {
      timer = null;
      persist(value);
    }, SAVE_DELAY_MS);
  });

  onScopeDispose(() => {
    if (timer === null) return;
    cancelPending();
    persist(doc.value);
  });

  function discard() {
    cancelPending();
    clearDraft(key);
    quotaExceeded.value = false;
  }

  return { doc, quotaExceeded, discard };
}
