/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Geoapify Geocoding API key. Optional: the app boots and supports manual
   * map-click adds without it. Never log this value.
   */
  readonly VITE_GEOAPIFY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
