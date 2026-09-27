# D1 schema and migration boundary

This release assumes the existing content tables plus `migrations/0001_reader_accounts.sql`, then
applies `migrations/0002_verified_identity_progress_knowledge.sql`.

## Reader identity

`0002` extends the existing reader tables rather than replacing user IDs, so bookmarks remain attached
to the same account during a safe prototype-session upgrade.

`reader_users` additions:

- `password_hash`
- `password_salt`
- `password_iterations`
- `registered_at`

`reader_sessions` addition:

- `auth_method`, defaulting existing sessions to `prototype`

Only sessions with `auth_method = 'password'` and a registered password account are accepted by
`getUser()`. `email_verified_at` remains reserved for future mailbox verification and is not set by
registration.

## Reading state

`reader_library_state` stores one row per `(user_id, novel_id)`:

- shelf status: `planned | reading | paused | finished`
- last chapter ID
- bounded progress percentage
- `progress_sync_count`
- `resume_open_count`
- `last_resumed_at`
- last update time

The browser submits progress only at `0, 25, 50, 75, 90, 100`, limiting normal synchronization to at
most six writes per chapter. An explicit Resume link records one resume-open and restores the stored
checkpoint client-side.

## Spoiler-aware knowledge model

The knowledge model is versioned and chapter-bounded:

- `story_knowledge_versions` — draft/published/retired editorial versions
- `story_chapter_sequence` — reviewed chapter IDs and spoiler ordinals
- `story_entities` — reviewed characters/locations/terms/organizations/items with first-visible ordinal
- `story_relations` — explicit reviewed relationships with reveal ordinal and source
- `story_events` — reviewed events with chapter ordinal and source

The application never infers a social relationship from name co-occurrence. SQL queries return only
reviewed rows whose reveal ordinal is at or before the requested reviewed chapter boundary. If the
chapter is outside curated coverage, the safe result is unavailable/empty rather than a guess.

The bundled pilot is intentionally small: version 1 for `a-regressors-tale-of-cultivation`, chapters
1-3 only. Expand coverage through additional reviewed rows/versioning, not request-time extraction.

## D1 full-text search

`story_chapter_fts` is an FTS5 virtual table containing the latest stored chapter revision. The
migration backfills it and adds an insert trigger that replaces the indexed row for the same logical
novel/chapter whenever a newer `novel-content` row is inserted.

The Worker only sanitizes a small token list and issues a prepared FTS query. It does not read every
Markdown row to search or generate excerpts.

## Remote migration

Use the JavaScript REST runner included in this patch; it does not require Wrangler:

```sh
npm run db:migrate:status
npm run db:migrate:remote
npm run db:verify:readers
```

The runner reads `.env`, checks the account/database identity, uses `d1_migrations` as migration
history, applies pending `.sql` files in filename order, and verifies the new schema afterward.

Back up production D1 before applying migrations. Do not use local content fixtures/importers as a
production migration substitute.
