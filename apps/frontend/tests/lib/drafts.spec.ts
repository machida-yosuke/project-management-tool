import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { emptyRichTextDoc, plainTextToRichTextDoc } from '@pm-tool/shared';
import {
  DraftQuotaError,
  clearDraft,
  draftKeys,
  loadDraft,
  saveDraft,
  useDraft,
} from '../../src/lib/drafts';

const doc = plainTextToRichTextDoc('Draft text');

// happy-dom's localStorage is a proxy that turns assigned properties into stored items, so swap the whole object.
function stubStorage(overrides: Partial<Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>>) {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    ...overrides,
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

function quotaError(name: string, code: number) {
  const error = new Error('quota');
  Object.assign(error, { name, code });
  return error;
}

describe('draft storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds per-task keys', () => {
    expect(draftKeys.description('t1')).toBe('draft:t1:description');
    expect(draftKeys.newComment('t1')).toBe('draft:t1:comment:new');
    expect(draftKeys.comment('t1', 'c1')).toBe('draft:t1:comment:c1');
  });

  it('builds per-project keys', () => {
    expect(draftKeys.newTask('p1')).toBe('draft:project:p1:new-task');
  });

  it('saves, restores and clears a draft', () => {
    saveDraft('draft:t1:description', doc);
    expect(loadDraft('draft:t1:description')).toEqual(doc);

    clearDraft('draft:t1:description');
    expect(loadDraft('draft:t1:description')).toBeNull();
  });

  it('ignores stored values that are not rich text docs', () => {
    localStorage.setItem('broken', '{not json');
    localStorage.setItem('wrong', JSON.stringify({ type: 'paragraph' }));

    expect(loadDraft('broken')).toBeNull();
    expect(loadDraft('wrong')).toBeNull();
    expect(loadDraft('missing')).toBeNull();
  });

  it.each([
    ['QuotaExceededError', 0],
    ['Error', 22],
    ['NS_ERROR_DOM_QUOTA_REACHED', 1014],
  ])('reports %s (code %i) as DraftQuotaError', (name, code) => {
    stubStorage({
      setItem: () => {
        throw quotaError(name, code);
      },
    });

    expect(() => saveDraft('k', doc)).toThrow(DraftQuotaError);
  });

  it('swallows other storage failures', () => {
    const fail = () => {
      throw new Error('SecurityError');
    };
    stubStorage({ getItem: fail, setItem: fail, removeItem: fail });

    expect(() => saveDraft('k', doc)).not.toThrow();
    expect(loadDraft('k')).toBeNull();
    expect(() => clearDraft('k')).not.toThrow();
  });
});

describe('useDraft', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function run<T>(fn: () => T) {
    const scope = effectScope();
    const result = scope.run(fn);
    if (!result) throw new Error('scope did not run');
    return { result, stop: () => scope.stop() };
  }

  it('prefers a stored draft over the initial doc', () => {
    saveDraft('k', doc);
    const { result } = run(() => useDraft('k', emptyRichTextDoc));
    expect(result.doc.value).toEqual(doc);
  });

  it('saves changes after a debounce and removes empty docs', async () => {
    const { result } = run(() => useDraft('k', emptyRichTextDoc));

    result.doc.value = doc;
    await nextTick();
    expect(localStorage.getItem('k')).toBeNull();
    vi.advanceTimersByTime(300);
    expect(loadDraft('k')).toEqual(doc);

    result.doc.value = emptyRichTextDoc();
    await nextTick();
    vi.advanceTimersByTime(300);
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('flushes a pending save when the scope is disposed', async () => {
    const { result, stop } = run(() => useDraft('k', emptyRichTextDoc));
    result.doc.value = doc;
    await nextTick();

    stop();

    expect(loadDraft('k')).toEqual(doc);
  });

  it('discard cancels the pending save and deletes the draft', async () => {
    saveDraft('k', doc);
    const { result, stop } = run(() => useDraft('k', emptyRichTextDoc));
    result.doc.value = plainTextToRichTextDoc('newer');
    await nextTick();

    result.discard();
    vi.advanceTimersByTime(300);
    stop();

    expect(localStorage.getItem('k')).toBeNull();
  });

  it('flags a quota error and clears it once saving works again', async () => {
    let full = true;
    const items = new Map<string, string>();
    stubStorage({
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => {
        if (full) throw quotaError('QuotaExceededError', 22);
        items.set(key, value);
      },
    });
    const { result } = run(() => useDraft('k', emptyRichTextDoc));

    result.doc.value = doc;
    await nextTick();
    vi.advanceTimersByTime(300);
    expect(result.quotaExceeded.value).toBe(true);

    full = false;
    result.doc.value = plainTextToRichTextDoc('smaller');
    await nextTick();
    vi.advanceTimersByTime(300);
    expect(result.quotaExceeded.value).toBe(false);
  });
});
