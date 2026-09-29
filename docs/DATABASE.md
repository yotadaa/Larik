# D1 schema and Markdown metadata synchronization

The canonical database workspace now lives under `database/`.

```text
database/
├── migrations/
│   ├── 0001_reader_accounts.sql
│   ├── 0002_verified_identity_progress_knowledge.sql
│   ├── 0003_atlas_full_story_ranges.sql
│   ├── 0004_markdown_metadata_v2.sql
│   └── 0005_characteristic_profile_boundaries.sql
├── schema/
│   ├── content-schema.sql
│   └── schema-contract.json
└── migrator.py
```

`scripts/sqilte-migration/migrator.py` remains as a compatibility entry point and delegates to
`database/migrator.py`.

## One command for remote schema + data

Preview:

```sh
npm run db:sync:preview
```

Apply pending numbered SQL migrations and then synchronize the latest Markdown snapshot:

```sh
npm run db:sync
```

The remote migration runner uses Cloudflare's D1 REST API and reads `database/migrations/` first. It
falls back to the legacy root `migrations/` directory only for older checkouts/test fixtures.

## Metadata-v2 schema

`0004_markdown_metadata_v2.sql` adds these snapshot tables:

- `metadata_documents` — every root Markdown document and content hash;
- `metadata_chapters` — chapter/index/review/recap state;
- `metadata_entity_history` — all source entity rows, including duplicate historical IDs;
- `metadata_entities` — canonical current entity registry;
- `metadata_aliases` — reveal-aware names/hidden identities;
- `metadata_relationships` — temporal, evidence-backed relations;
- `metadata_facts` — atomic facts with epistemic status;
- `metadata_events` — chapter/scene ordered events;
- `metadata_states` — temporal entity state history;
- `metadata_scenes` — scene participants, locations and event links;
- `metadata_arcs` — story-arc windows;
- `metadata_cycles` — regression-cycle windows;
- `metadata_characteristics` — entity/profile characteristics;
- `metadata_glossary` — source/canonical terminology rows;
- `metadata_memory_entries` — characters/locations/continuity/terminology/QA memory rows;
- `metadata_integrity_issues` — deterministic warnings/errors from the source audit.

`metadata_sync_runs` records completed snapshots. The canonical tables use the corpus SHA-256 as
`snapshot_id`; app queries select only the newest completed snapshot. If a new sync stops partway
through, its rows are not made reader-visible because no completed sync row exists yet.

`metadata_novel_content_stage` is a persistent staging table for chapter bodies. The migrator uploads
large content in bounded batches, then replaces `novel-content` only after staging has completed.

## Characteristic profile boundaries

`0005_characteristic_profile_boundaries.sql` adds `profile_through_chapter` to `metadata_characteristics`. Detailed profile prose is cumulative and is therefore released only at its complete `characteristic_as_of_chN` boundary; registry-only rows can become visible at first-seen. This prevents a later biography snapshot from leaking through an entity that was introduced much earlier.

## Multi-series discovery and seeding

`scripts/sqilte-migration/migrator.py` no longer defaults to one novel slug. With no positional paths it discovers every compatible direct child under `id/` and builds an independent snapshot keyed by that directory name as `novel_id`. All discovered series are validated before the first remote write. During apply, legacy reader rows are replaced only for the current `novel_id`, while canonical metadata remains versioned by `(novel_id, snapshot_id)`.

```bash
# validate every compatible id/* series
npm run db:seed:preview

# seed/sync every compatible id/* series
npm run db:seed

# schema migrations first, then the same multi-series sync
npm run db:sync
```

The older `0002`/`0003` migrations contain a historical ARTCoC pilot dataset for backward compatibility. They are not the current corpus seeder; current content and metadata come from the multi-series Markdown sync after schema migration.

## Latest-data semantics

The old migrator appended rows when a fingerprint changed. That could leave stale reader/reference
records beside newer metadata. The new synchronizer instead:

1. parses the current Markdown source of truth;
2. validates references without inventing missing information;
3. writes an immutable canonical snapshot keyed by source hash;
4. stages/replaces current reader chapter content;
5. replaces legacy reference tables for compatibility;
6. marks the new canonical snapshot complete only after all phases succeed.

Running the same unchanged corpus again is idempotent at the canonical row level, and
`metadata_sync_runs` is unique per `(novel_id, source_hash)`.

## Current corpus state found during this implementation

For `id/a-regressors-tale-of-cultivation` the current uploaded workspace contains:

- 24 root Markdown metadata/reference documents;
- 200 actual chapter files;
- 200 actual recap files;
- 200 rows in `chapter-index.md`, matching the 200 current chapter files;
- reviewed metadata through chapter 163.

The current normalized snapshot produces 132 canonical entities, 18 aliases, 28 relationships,
37 facts, 50 events, 28 states, 22 scenes, 16 arcs, 15 cycles, 64 characteristic rows, 424 glossary
rows and 535 memory rows. The validator currently records 60 warnings and zero errors. Warnings include
source/index filename mismatches, duplicate entity IDs, unresolved entity/event/scene references,
unknown canonical references and unresolved wikilinks.

These warnings are deliberately retained instead of silently rewriting story knowledge.

## Spoiler boundary

The app reads metadata-v2 through SQL queries that apply reveal/review boundaries before
serialization. Future aliases are queried separately and are not attached to entity nodes before their
own reveal chapter. Unreviewed metadata is returned only after the reader explicitly unlocks a later
range.

The legacy `story_*` knowledge tables remain as a fallback until the first completed metadata-v2 sync,
so applying the schema migration alone does not break an existing deployment.

## Validation commands

```sh
npm run db:metadata:validate
npm run test:metadata
npm run test:atlas
npm run test:reader-features
npm run test:syntax
npm run test:core-types
```

No production D1 write is required by those commands.
