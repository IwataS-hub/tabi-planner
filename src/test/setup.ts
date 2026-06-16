// Global test setup shared by every Vitest run.
// - jest-dom adds DOM matchers (toBeInTheDocument, etc.) to Vitest's expect.
// - fake-indexeddb/auto installs an in-memory IndexedDB so Dexie works in Node.
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
