# Change manifest — 2026-09-28 password / spoiler-safe discovery cycle

## Account and reader state

- password-first registration/login; blind email login removed,
- safe prototype-session upgrade preserving the stable reader ID,
- cross-device last-chapter/progress state and shelf status,
- resume-reading action on the novel page with browser-side checkpoint restoration,
- D1 counters for progress-sync and resume-open measurement.

## Discovery and knowledge

- additive D1 migration `0002_verified_identity_progress_knowledge.sql`,
- manually curated/versioned spoiler-safe pilot for chapters 1–3 of
  `a-regressors-tale-of-cultivation`,
- D1-enforced reveal boundaries for entities, relationships and events,
- chapter-safe inline lookup,
- D1 FTS5 chapter search with revision-maintaining trigger,
- focused network, temporal storyline, fact ledger and event timeline.

## UI

- reusable accessible custom listbox,
- every native `<select>` replaced,
- reader lookup drawer,
- shelf-status control and FTS excerpts.

## Tests and research

- auth/progress/bookmark and spoiler/FTS tests updated,
- JavaScript-only remote D1 migration runner restored for the project `.env` workflow,
- visualization research refreshed in `docs/research/VISUALIZATION_RESEARCH_2026.md`,
- future sequence updated in `docs/NEXT_FEATURES.md`.

## Metadata-v2 / D1 synchronization patch — 2026-09-28

- Added canonical `database/` workspace and migration `0004_markdown_metadata_v2.sql`.
- Replaced the old Python append/fingerprint importer with a deterministic Markdown snapshot synchronizer; the legacy script path is now a compatibility wrapper.
- Added one-command `npm run db:sync` plus read-only preview/validation commands.
- Updated D1 migration discovery to prefer `database/migrations/`.
- Updated Story Atlas server loading to prefer the latest completed metadata-v2 snapshot and fall back to legacy story tables before the first sync.
- Added reveal-safe alias handling plus atomic Facts, States, Scenes, Arcs and Cycles visualization.
- Added metadata-v2 regression/contract tests and current-corpus validation.
- Added research for the next feature: Metadata Review Queue / Provenance Editor.
