import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names and de-duplicate conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** True when `value` is a valid absolute http(s) URL. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Parse a non-negative integer from an input string, or null when blank/invalid. */
export function parseNonNegativeIntOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/** Create a unique id. Uses crypto.randomUUID where available. */
export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for very old environments / some test runners.
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
