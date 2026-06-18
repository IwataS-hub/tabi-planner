# Tabiori Product Roadmap

This roadmap prioritizes a coherent trip lifecycle: plan, travel, settle expenses, and review.

## Current foundation

- Local-first trip, day, and place editing
- Map, place search, reverse geocoding
- Walk / drive / bicycle route estimates
- Public transit via Google Maps with manual duration
- Daily summary
- JSON backup / restore
- Print / PDF layout
- GitHub Pages deployment

## Sprint A — Trip toolkit

Target branch: `feat/phase-2-3-trip-toolkit`

### Weather

- Open-Meteo daily and hourly forecast
- Temperature, precipitation, wind, UV, sunrise, sunset
- Weather for scheduled place times
- Deterministic umbrella / heat / cold / UV / wind advice
- Memory-only cache and manual refresh

### People, budget, expenses, and settlement

- Trip participants
- Trip budget
- Expense records and categories
- Payer and beneficiaries
- Equal, selected-person, and custom splits
- Integer-yen remainder handling
- Per-person paid / owed / balance
- Deterministic settlement suggestions

### Packing and tasks

- Packing and todo lists
- Assignment, due time, completion, ordering
- Weather-based suggestions, never auto-added

### Visit status

- Planned / visited / skipped
- Card, map, summary, and print integration

## Sprint B — Smart itinerary

Target branch: `feat/phase-2-4-smart-itinerary`

- Unscheduled place inbox
- Move places between days
- Duplicate-place warnings
- Reservations for lodging, transit, restaurants, and events
- `.ics` calendar export
- Automatic arrival / departure timeline from start, stay, and travel times
- Conflict and lateness warnings
- Overpacked-day, long-travel, rain, sunset, and missing-lodging warnings
- Trip templates and safe trip duplication

## Sprint C — Travel mode and sharing

Target branch: `feat/phase-2-5-travel-mode-sharing`

- Travel-day execution mode
- Current and next stop, navigation, visit completion, delay input
- PWA install and offline shell
- Selective export that can exclude private notes or reservation numbers
- Read-only share package
- QR and itinerary image export
- Planned versus actual comparison
- Trip journal and post-trip summary
- Dark mode and display preferences

## Later data enrichment

- Wikipedia summaries and images
- Nearby toilets, stations, convenience stores, lockers, parking, cafes, and hospitals
- Official-site and opening-hours references with clear accuracy disclaimers
- Emergency and medical notes with explicit exclusion from shared exports

## Phase 3 — AI itinerary assistant

Only after the structured data model is stable:

- Natural-language trip brief to candidate places
- Weather, budget, travel-time, and preference-aware day assignment
- Alternate indoor plans for rain
- Reordering suggestions with explicit user approval
- Explanation of assumptions and constraints

The AI must propose changes; it must not silently rewrite a saved itinerary.

## Explicitly deferred

- Realtime collaborative editing
- Banking, cards, or payment integrations
- Receipt image storage or OCR
- Continuous location tracking
- In-app public social network
- Proprietary public-transit routing
- Server-required sharing until privacy and operations are designed
- Multiple currencies until the domestic yen workflow is stable
