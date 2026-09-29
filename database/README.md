# Database workspace

This folder is the canonical home for D1 schema and Markdown-to-D1 synchronization.

## Layout

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

`scripts/migrate-d1.mjs` now reads `database/migrations/` first. The old root `migrations/` path is only a backward-compatible fallback for older checkouts/test fixtures.

## One-command synchronization

Preview the target and validate the current Markdown snapshot without writing metadata:

```sh
npm run db:sync:preview
```

Apply pending D1 schema migrations and then synchronize the current Markdown corpus:

```sh
npm run db:sync
```

The second command intentionally has two phases:

1. `db:migrate:remote` applies pending numbered SQL migrations through the Cloudflare D1 REST API.
2. `db:metadata:sync` parses the current novel workspace and synchronizes the latest content/metadata snapshot.

No Wrangler CLI command is required by the remote migration/sync path.

## Metadata snapshot model

`0004_markdown_metadata_v2.sql` adds normalized tables for:

- root Markdown source documents,
- chapter/index state,
- entity history and canonical entities,
- aliases and hidden identities,
- temporal relationships,
- atomic facts and epistemic status,
- events, states, scenes, arcs and regression cycles,
- characteristics/profiles,
- glossary rows,
- translation-memory/reference rows,
- integrity issues discovered during parsing.

Each canonical row is attached to a `snapshot_id` derived from the source corpus hash. The app reads only the latest **completed** `metadata_sync_runs` snapshot. This makes an interrupted new synchronization invisible to readers until it finishes.

Large chapter bodies are uploaded to `metadata_novel_content_stage` first. Only after staging succeeds does one D1 batch replace the reader-facing `novel-content` rows and clear the staging rows.

## Characteristic profile boundaries

`0005_characteristic_profile_boundaries.sql` adds `profile_through_chapter` to `metadata_characteristics`. Detailed profile prose is cumulative and is therefore released only at its complete `characteristic_as_of_chN` boundary; registry-only rows can become visible at first-seen. This prevents a later biography snapshot from leaking through an entity that was introduced much earlier.

## Source of truth

The seeder is **multi-series by default**. With no positional series arguments it scans every direct child of `id/` that contains `NOVEL.md`, `chapter-index.md`, and `chapters/`, validates all discovered series first, then synchronizes them one by one. Optional metadata Markdown files may be added progressively; a missing optional table file contributes zero rows rather than forcing a hard-coded novel path.

For the currently attached `id/a-regressors-tale-of-cultivation` example:

- actual files under `chapters/` are the reader-content truth;
- `chapter-index.md` supplies translation/review/planning status;
- the structured root metadata Markdown files supply canonical Story Atlas knowledge;
- `reveal_chapter` and review status are enforced in D1 queries before serialization;
- unresolved IDs, missing files, duplicate IDs, or broken evidence links are recorded as integrity warnings rather than guessed or silently rewritten.

Run the parser/contract checks locally with:

```sh
npm run db:metadata:validate
npm run test:metadata
```
