import { useLiveQuery } from 'dexie-react-hooks';

export type LiveResult<T> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'ready'; data: T; error: undefined }
  | { status: 'error'; data: undefined; error: Error };

/**
 * Wrap a Dexie live query so loading / ready / error are explicit states the UI
 * can render. Errors thrown by the querier (e.g. corrupt data rejected by Zod)
 * are captured and surfaced rather than crashing the tree.
 */
export function useLiveQueryResult<T>(
  querier: () => Promise<T>,
  deps: unknown[] = [],
): LiveResult<T> {
  const wrapped = useLiveQuery(async () => {
    try {
      return { ok: true as const, value: await querier() };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, deps);

  if (wrapped === undefined) return { status: 'loading', data: undefined, error: undefined };
  if (wrapped.ok) return { status: 'ready', data: wrapped.value, error: undefined };
  return { status: 'error', data: undefined, error: wrapped.error };
}
