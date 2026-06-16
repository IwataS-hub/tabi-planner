import type { z } from 'zod';

/** Thrown when stored data fails schema validation (corruption / bad migration). */
export class PersistenceError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PersistenceError';
    this.cause = cause;
  }
}

/** Current ISO timestamp; centralised so it can be stubbed in tests if needed. */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Validate `data` against `schema`, throwing a PersistenceError on failure.
 * Used on both the write path (reject bad input before it is stored) and the
 * read path (reject corrupt stored data) so errors are never swallowed.
 */
export function validateRecord<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new PersistenceError(`${context} の検証に失敗しました: ${detail}`, result.error);
  }
  return result.data;
}
