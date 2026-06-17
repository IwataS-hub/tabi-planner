/**
 * Single, centralised access point for build-time environment configuration.
 *
 * The Geoapify API key is read from `import.meta.env.VITE_GEOAPIFY_API_KEY`.
 * Rules enforced here so the rest of the app never has to think about them:
 * - The key value is NEVER logged or returned in any error string.
 * - A missing or blank key is treated as "geocoding not configured"; the app
 *   still boots and manual map-click adds keep working.
 */

/** The configured Geoapify API key, or `null` when unset/blank. */
export function getGeoapifyApiKey(): string | null {
  const raw = import.meta.env.VITE_GEOAPIFY_API_KEY;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/** True when a Geoapify key is present and search/reverse geocoding can run. */
export function isGeocodingConfigured(): boolean {
  return getGeoapifyApiKey() !== null;
}
