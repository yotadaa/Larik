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
