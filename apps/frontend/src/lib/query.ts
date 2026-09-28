import { useQueryCache, type EntryKey } from '@pinia/colada';
import { getListProjectCommentsQueryKey, getListTasksQueryKey } from '../api/generated';

export function useInvalidate() {
  const cache = useQueryCache();
  // Refetch failures already surface through each query's `error`; they must not fail the mutation.
  return (...keys: EntryKey[]) =>
    Promise.all(keys.map((key) => cache.invalidateQueries({ key }))).then(
      () => undefined,
      () => undefined,
    );
}

// The generated key ends with `params ?? null`, so drop it to prefix-match every `includeArchived` variant.
export function listTasksKeyPrefix(projectId: string): EntryKey {
  return getListTasksQueryKey(projectId).slice(0, 3);
}

export function listProjectCommentsKeyPrefix(projectId: string): EntryKey {
  return getListProjectCommentsQueryKey(projectId).slice(0, 3);
}
