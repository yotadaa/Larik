# Larik / The Reading Room

A React Router 8 novel reader for Cloudflare Workers + D1. This feature release replaces the
blind-email prototype with password registration/login, adds D1-backed reading state and discovery,
and changes Story Atlas into a reviewed, chapter-bounded knowledge model.

## Identity model

- A new reader must **register an email + password** before login.
- Login with an email alone is no longer accepted.
- Passwords are salted and derived with PBKDF2-HMAC-SHA256 before storage; plaintext passwords are
  never stored.
- Email delivery/mailbox verification is **not implemented yet**, so the account is password-protected
  but `email_verified_at` remains null.
- Old prototype sessions are rejected for normal authenticated access. A still-valid prototype
  browser session may perform a one-time registration upgrade for the same legacy user ID so its
  bookmarks are preserved. Email knowledge by itself cannot claim legacy data.

## Features in this release

| Feature | Behavior |
| --- | --- |
| Register / login | `/register`, `/login`; email + password required |
| Bookmarks | D1-backed novel/chapter bookmarks scoped to the signed-in account |
| Reading shelf | Want to read / Reading / Paused / Finished, using a custom listbox |
| Resume reading | Stores chapter + bounded progress checkpoints in D1; explicit Resume restores the saved checkpoint in the browser |
| Reader write measurement | D1 keeps progress-sync and resume-open counters; at most six progress checkpoints are emitted per chapter |
| Chapter dock | Previous / novel / bookmark / next; hides while reading down and returns on upward movement or focus |
| Inline lookup | Chapter-safe facts open beside the text without navigating away |
| Chapter discovery | D1 FTS5 searches stored chapter title/text and returns excerpts; no Worker corpus scan |
| Story Atlas | Reviewed chapter boundary, network, temporal storyline, facts and events |
| Custom dropdowns | Native HTML `select` controls are not used in the application UI |

## Spoiler-safe Story Atlas

The old mention-inference model has been removed from runtime. Atlas facts are now explicit,
versioned D1 records:

- `story_knowledge_versions`
- `story_chapter_sequence`
- `story_entities`
- `story_relations`
- `story_events`

Every published fact has a reviewed flag and reveal ordinal. The Atlas loader requires an exact
reviewed chapter boundary and filters in SQL **before data reaches the browser**. Unknown or uncovered
boundaries fail closed instead of guessing. The included pilot deliberately covers only chapters 1-3
of `a-regressors-tale-of-cultivation`.

Visualization layout/filtering is browser-side. The Worker does not perform relationship extraction,
NLP, graph inference, or corpus scans. Chapter full-text search is maintained by a D1 FTS5 table and
trigger. See `docs/research/VISUALIZATION_RESEARCH_2026.md`.

## Remote D1 migration without Wrangler

This archive includes `scripts/migrate-d1.mjs`, which reads your project-root `.env` and talks directly
to the Cloudflare D1 REST API. It uses:

```dotenv
DATABASE_PROVIDER=D1
DATABASE_NAME=novel
DATABASE_ID=<d1 database uuid>
CLOUDFLARE_ID=<cloudflare account id>
CLOUDFLARE_API_TOKEN=<token with D1 write permission>
```

Preview the remote target and pending migrations:

```sh
npm run db:migrate:status
```

Apply pending migrations:

```sh
npm run db:migrate:remote
```

Then verify the password-auth, reader-state, knowledge and FTS schema:

```sh
npm run db:verify:readers
```

`0002_verified_identity_progress_knowledge.sql` is additive to the reader schema created by
`0001_reader_accounts.sql`. Back up production D1 before applying it. Never commit `.env` or API
credentials.

## Validation

Focused regression tests can be run without a live Cloudflare database:

```sh
npm run test:reader-features
```

For the normal application build use Node.js **22.22+**:

```sh
npm install
npm run build
```

The delivery environment used to prepare this patch has Node 22.16 and could not complete dependency
installation from the registry, so a framework production build is not claimed here. The targeted
SQLite/D1-contract tests, migration execution, source scans and TypeScript syntax/core-library checks
are recorded in `docs/EVALUATION.md`.

## Documentation

- `docs/FEATURE_PLAN.md` — implemented workflow and release boundaries
- `docs/AUTH_AND_BOOKMARKS.md` — account security and prototype-session upgrade
- `docs/DATABASE.md` — migrations and D1 data model
- `docs/research/VISUALIZATION_RESEARCH_2026.md` — visualization research and decisions
- `docs/NEXT_FEATURES.md` — next implementation plan
- `docs/EVALUATION.md` — checks actually executed
- `docs/CHANGE_MANIFEST.md` — changed areas for this release
