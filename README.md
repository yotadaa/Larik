# Larik by Mukhtada

A React Router 8 novel reader for Cloudflare Workers + D1. This feature release replaces the
blind-email prototype with password registration/login, adds D1-backed reading state and discovery,
and changes Story Atlas into a chapter-bounded knowledge model backed by normalized Markdown metadata snapshots.

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
| Story Atlas | Spoiler-filtered network, storyline, atomic facts, events, states, scenes, arcs and cycles |
| Custom dropdowns | Native HTML `select` controls are not used in the application UI |

## Spoiler-safe Story Atlas

The app now prefers the latest **completed metadata-v2 snapshot** in D1. The canonical schema lives in
`database/migrations/0004_markdown_metadata_v2.sql` and stores entities, aliases, relationships, atomic
facts, events, entity states, scenes, arcs, cycles, characteristics, glossary rows, source documents and
integrity findings. Legacy `story_*` tables remain a safe fallback until the first metadata-v2 sync.

`reveal_chapter` and reviewed/unreviewed status are filtered in SQL **before data reaches the browser**.
Future aliases/hidden identities are filtered independently as well, so a canonical entity cannot leak a
later alias through its node payload. Visualization layout remains browser-side; runtime does not parse
the Markdown corpus or infer relationships from prose.

The uploaded workspace currently contains 182 chapter files, 181 recap files, and a 200-row chapter
index with reviewed metadata through chapter 163. The validator records source inconsistencies as
warnings rather than inventing corrections.

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

Preview the target plus the Markdown metadata snapshot:

```sh
npm run db:sync:preview
```

Apply pending schema migrations and synchronize the latest Markdown data in one command:

```sh
npm run db:sync
```

Read-only reader-schema verification remains available with `npm run db:verify:readers`.

`database/migrations/` is now the canonical migration directory. `scripts/migrate-d1.mjs` still falls back to the old root `migrations/` directory for older checkouts/test fixtures. Back up production D1 before applying schema changes. Never commit `.env` or API
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
- `docs/research/NEXT_FEATURE_RESEARCH_2026-09-28.md` — Metadata Review Queue / Provenance Editor research
- `database/README.md` — canonical D1 migration and metadata-sync workflow
- `docs/NEXT_FEATURES.md` — next implementation plan
- `docs/EVALUATION.md` — checks actually executed
- `docs/CHANGE_MANIFEST.md` — changed areas for this release
