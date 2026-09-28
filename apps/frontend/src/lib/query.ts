import { useQueryCache, type EntryKey } from '@pinia/colada';

export function useInvalidate() {
  const cache = useQueryCache();
  // Refetch failures already surface through each query's `error`; they must not fail the mutation.
  return (...keys: EntryKey[]) =>
    Promise.all(keys.map((key) => cache.invalidateQueries({ key }))).then(
      () => undefined,
      () => undefined,
    );
}
