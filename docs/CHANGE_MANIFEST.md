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

## Research-aligned Story Atlas visualization pass — 2026-09-29

- Reworked the reader Atlas into six primary views: Network, Storyline, Matrix, Character, Arcs &
  cycles, and Evidence.
- Added `AtlasRelationshipMatrix`, `AtlasEntityChronology`, `AtlasArcNavigator`, and
  `AtlasEvidenceView`.
- Upgraded `AtlasStoryline` to use explicit relationship/event/scene/arc activity plus regression
  cycle bands.
- Added validity-aware range context for explicit relationships and entity states while preserving
  `reveal_chapter` as the spoiler boundary.
- Extended canonical D1 Atlas projection with cycle IDs, fact history references, event
  timeline/causality/location/certainty/evidence, plus scene/arc/cycle evidence.
- Kept React Flow and Cytoscape out of the reader bundle; they remain future editor/scale options as
  documented in visualization research.
- Expanded Atlas regression coverage for the richer metadata payload and temporal range semantics.

## Cloudflare production authentication fix — 2026-09-29

- Moved 600,000-iteration PBKDF2 hash/verify work out of the front Worker and into the
  SQLite-backed `PasswordKdf` Durable Object, preserving existing password hashes.
- Added `AUTH_KDF` Durable Object binding and current `exports`-based SQLite namespace declaration.
- Removed production fallback to direct/front-Worker password KDF; login/register must receive the
  bound KDF service.
- Added structured auth failure logs and reader-visible 503 request references.
- Enabled Workers Observability so route/Worker errors are retained in Cloudflare Logs.
- Added a remote D1 schema verification gate before deployment and expanded the schema contract with
  current password/session/library-state columns.
- Kept public reading available if optional session lookup temporarily fails; protected data remains
  session-gated.
- Added Durable Object KDF compatibility/configuration tests.


## 2026-09-29 — metadata-aware reader experience

- Added spoiler-safe `characteristics.md` ingestion with explicit cumulative profile boundaries.
- Stopped copying cumulative characteristic prose into early canonical entity descriptions.
- Added Story Atlas **Profiles** view with evidence, search, type filtering, and structured record counts.
- Added collapsed post-reading Chapter Context for reviewed scenes/events/facts/states/relationships.
- Added direct Atlas `view` URLs and Story Reference link for Entity profiles.
- Relabeled QA navigation as Editorial QA to distinguish project-quality notes from story canon.
- Added `docs/research/METADATA_READER_EXPERIENCE_2026-09-29.md` mapping every root Markdown to its appropriate reader/editor surface.

## Multi-series seeding + metadata Markdown rendering — 2026-09-29

- Removed the current metadata seeder's default ARTCoC slug; `scripts/sqilte-migration/migrator.py`
  now discovers every compatible direct child of `id/` when no paths are supplied.
- Validates every discovered series before the first D1 write, then syncs snapshots independently by
  `novel_id`; legacy replacement queries remain scoped to that `novel_id`.
- Made optional metadata table files non-fatal so a compatible series can introduce metadata files
  progressively while keeping the canonical parser shared across every series.
- Added `db:seed` / `db:seed:preview` aliases; `db:sync` continues to run schema migrations followed
  by the same multi-series metadata sync.
- Added reusable `MetadataMarkdown` rendering across reader metadata surfaces: Profiles, Network,
  Matrix, Character chronology, Arcs/Cycles, Evidence, Inline Lookup, chapter context, and Reference.
- Added Obsidian wikilink routing for chapter evidence and known metadata documents. Unknown targets
  remain readable text rather than becoming dead links.
- Kept raw HTML disabled; metadata rendering uses the existing React Markdown + GFM pipeline.
- Added multi-series discovery/validation tests and metadata-Markdown routing tests.
