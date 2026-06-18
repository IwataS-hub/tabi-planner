# Claude Code Prompt — Phase 2.3 Trip Toolkit

Copy the block below into Claude Code after `CLAUDE.md` has been merged into the branch you are working from.

```text
Read and follow CLAUDE.md. Implement Sprint A, “Trip toolkit”.

Start from clean, up-to-date main and create:
feat/phase-2-3-trip-toolkit

Do not push, merge, deploy, or tag.

## Scope

### Weather
Use Open-Meteo without an API key.

- Daily: weather code, max/min/apparent temperature, max precipitation probability, precipitation sum, max wind, UV, sunrise, sunset
- Hourly: temperature, apparent temperature, precipitation probability, weather code, wind
- Representative coordinate: first place of the day, otherwise first available place in the trip; no place means no request
- Show compact day weather plus scheduled-place hourly weather
- Deterministic advice for umbrella, heavy rain, heat, cold, UV, and wind
- Never substitute current/last forecast for past or out-of-range dates
- Provider abstraction, Zod validation, timeout/abort/error categories
- Bounded 30-minute memory cache, in-flight sharing, manual refresh
- Do not persist or back up forecasts or advice

### Participants, budget, expenses, and settlement
Add persistent models and repositories for:

- Participant: trip, name, order, timestamps
- Expense: trip, optional day/place, title, integer amountYen, category, payer, optional occurredAt, memo, timestamps
- ExpenseShare: expense, participant, integer amountYen
- Optional Trip budgetYen

Support:

- Equal split across all or selected participants
- Custom integer-yen shares
- Deterministic remainder allocation by participant order then id
- Atomic expense + share writes
- Paid / owed / balance per participant
- Deterministic settlement suggestions with no zero/self transfers
- Participant deletion blocked while referenced
- Budget, spent, remaining/over budget, daily and category summaries

### Checklists
Add persistent ChecklistItem with:

- trip, kind packing|todo, title, completed, optional assignee, optional dueAt, category, order, timestamps
- CRUD, completion, reorder, incomplete filter, assignment, due date
- Weather-based suggestions that require user selection and avoid duplicate incomplete items

### Visit status
Add optional Place visitStatus planned|visited|skipped.

- Legacy places normalize to planned
- Show on card and map without color-only meaning
- Include in daily summary and print
- Do not reorder or recalculate routes automatically

## UI
Within a trip, add compact navigation:

- Itinerary
- Money
- Checklists

Preserve the current itinerary/map layout. Keep 375 px usable and errors visible without toast-only handling.

## Dexie and repositories
Add only the required tables and indexes. Preserve existing records during migration.

- participants
- expenses
- expenseShares
- checklistItems

No React-to-Dexie access. Multi-table writes, trip deletion, and import must be transactional.

## Backup
Keep `tabiori-trip-backup` version 1 and 2 MB limit.

Add optional/default-empty arrays:

- participants
- expenses
- expenseShares
- checklistItems

On import regenerate every entity id and remap every foreign key, including day/place/payer/share/assignee references. Validate share totals and all references before the single transaction commits. Weather is excluded.

## Print and docs
Print budget, expense total, settlement, incomplete checklist items, and visit status. Include weather only if already in memory; printing must not trigger a request.

Update README and docs/ROADMAP.md for Open-Meteo, privacy, expense splitting, checklists, visit status, local storage, and backup contents.

## Exclude
Reservations, nearby POIs, Wikipedia, PWA, sharing, notifications, multiple currencies, OCR, cloud sync, and AI.

## Required coverage
Add focused tests for:

- weather conversion, missing data, errors, cache, date range, representative coordinate, advice
- equal/custom/remainder splits, settlement, deletion constraints, atomicity, integer validation
- checklist CRUD/reorder/assignment/due/filter/weather suggestions/duplicate prevention
- visit-status legacy normalization, summary, print, map/card state
- old v1 backup, new arrays, all ID/FK remaps, invalid references, rollback, round trip, weather exclusion
- key UI states and mocked Open-Meteo E2E

Use no real network in tests. Keep the work within four commits. Run the final verification from CLAUDE.md and provide its compact final report.
```
