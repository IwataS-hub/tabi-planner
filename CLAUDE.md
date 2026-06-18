# Tabiori Claude Code Instructions

This file contains the standing rules for all Claude Code work in this repository. Read it before planning or editing.

## Project

- React + TypeScript + Vite
- GitHub Pages + HashRouter
- Dexie / IndexedDB, local-first, no application server
- Zod validation
- React Leaflet + GSI map tiles
- Geoapify for place search, reverse geocoding, and walk/drive/bicycle routes
- Public transit opens Google Maps; transit duration is entered manually
- Vitest / Testing Library / Playwright

## Start every task

1. Run `git status --short`, `git branch --show-current`, and a short `git log`.
2. Confirm the requested base branch matches `origin`.
3. If there are uncommitted changes, do not reset, stash, delete, or overwrite them. Report and stop.
4. Create the requested feature branch from `main` unless the prompt explicitly says otherwise.
5. Inspect only the files relevant to the task and their direct dependencies.

## Architecture rules

- React components must not access Dexie directly.
- Persist data only through repository methods.
- Multi-table writes must use a single Dexie transaction.
- Keep UI/domain types separate from persistence records and external API payloads.
- Validate persisted records and external API responses with Zod.
- External providers must be replaceable and testable with injected/mocked `fetch`.
- Implement timeout, abort, stable UI error categories, and stale-response protection.
- Never overwrite user edits with delayed background responses.
- Do not revive deleted records after an async response.
- Keep cache bounded, expiring, and memory-only unless the task explicitly requires persistence.
- Do not persist raw API responses, route geometry, weather payloads, or request URLs.
- Add dependencies only when the existing stack cannot reasonably solve the task.

## Security and privacy

- Never print, log, commit, fixture, snapshot, or report API keys.
- `.env.local` must remain ignored.
- Browser-bundled keys are not secret; document origin restrictions and usage limits.
- Do not include personal travel data or real reservation details in tests, docs, or screenshots.
- External-service failures must not make local itinerary data unusable.

## Data and compatibility

- Existing trips must remain readable.
- Optional added fields must accept missing legacy values and normalize empty values consistently.
- Do not bump the trip schema version or Dexie version without a concrete migration need.
- Preserve deterministic ordering with explicit tie-breaks.
- Use integer yen values for money; never use floating-point currency arithmetic.

## Backup invariants

Keep these unless a prompt explicitly authorizes a versioned breaking change:

- `format: tabiori-trip-backup`
- `version: 1`
- 2 MB limit
- Legacy version 1 files remain importable
- Export contains all current persistent trip data
- Import regenerates all entity IDs
- Every foreign key is remapped to the new ID
- Orders are normalized deterministically
- References and aggregate invariants are validated before commit
- Import is one transaction
- Failed imports leave no partial data
- Duplicate import submission is guarded
- Ephemeral API/cache/geometry data is excluded

## UI rules

- Preserve the existing design language; do not redesign unrelated screens.
- Prevent horizontal overflow at 375 px.
- Keep primary actions keyboard accessible.
- Use labels, `aria-label`, visible focus, and meaningful empty/error states.
- Do not rely on color alone or toast alone.
- Keep manual fallbacks when an external API is unavailable.

## Testing rules

- Never call real external APIs from automated tests.
- Mock geocoding, routing, weather, maps, and external navigation.
- Add focused tests for normal, empty, invalid, timeout, abort, stale, race, and backward-compatibility paths where relevant.
- Test public repository methods, not only internal helpers.
- Do not weaken or delete assertions merely to make tests pass.
- Avoid flaky E2E; prefer deterministic repository/component coverage when drag-and-drop or browser behavior is unstable.

## Final verification

Run targeted tests while developing, then run each once at the end:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
VITE_GEOAPIFY_API_KEY= npm run build
npm run test:e2e
npx prettier --check README.md ".github/workflows/*.yml" "src/**/*.{ts,tsx,css}"
```

Run `npm ci` only when dependencies or the lockfile require it.

## Git rules

- Keep one coherent feature group per branch.
- Use no more than four commits unless the task clearly requires more.
- Do not push, merge to `main`, force-push, deploy, or create tags unless explicitly requested.
- Finish with a clean working tree.

## Final report

Keep the report compact and include only:

1. starting HEAD and branch
2. implementation summary
3. important design decisions
4. migration and backward compatibility
5. tests and final verification
6. changed files / diff stat
7. `git status --short`
8. final commit hash
9. remaining P0/P1 risks
10. focused items for Codex review
