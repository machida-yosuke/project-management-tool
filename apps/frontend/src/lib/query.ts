import { useQueryCache, type EntryKey, type QueryCache } from '@pinia/colada';
import { getListProjectCommentsQueryKey, getListTasksQueryKey } from '../api/generated';
import type { Task } from '../api/generated/models';

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

export function patchCachedTasks(
  cache: QueryCache,
  projectId: string,
  taskId: string,
  patch: (task: Task) => Task,
): () => void {
  const key = listTasksKeyPrefix(projectId);
  // An in-flight refetch would otherwise land after the patch and overwrite it with stale data.
  cache.cancelQueries({ key });
  const snapshots = cache.getEntries({ key }).map((entry) => {
    const previous = cache.getQueryData<Task[]>(entry.key);
    if (previous !== undefined) {
      cache.setQueryData<Task[]>(
        entry.key,
        previous.map((task) => (task.id === taskId ? patch(task) : task)),
      );
    }
    return { key: entry.key, previous };
  });
  return () => {
    for (const { key: entryKey, previous } of snapshots) {
      if (previous !== undefined) cache.setQueryData<Task[]>(entryKey, previous);
    }
  };
}
