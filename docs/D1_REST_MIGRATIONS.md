# Remote D1 migrations using JavaScript and `.env`

The project includes `scripts/migrate-d1.mjs`, a standalone Node.js migration runner for the remote
Cloudflare D1 database. It does **not** invoke Wrangler, start a local D1 database, deploy a Worker,
or require an npm package. It reads the existing project-root `.env` and applies the SQL files under
`migrations/` directly through Cloudflare's D1 REST API.

## Configuration

Keep these entries in the project-root `.env`:

```dotenv
DATABASE_NAME=novel
DATABASE_ID=<d1 database uuid>
DATABASE_PROVIDER=D1

# Your Cloudflare ACCOUNT ID, not a user ID or zone ID.
CLOUDFLARE_ID=YOUR_32_CHARACTER_ACCOUNT_ID
CLOUDFLARE_API_TOKEN=YOUR_API_TOKEN_WITH_D1_WRITE_PERMISSION
```

Verify that the database ID is still the intended production/staging database before applying a
migration. `CLOUDFLARE_ID` must be the Cloudflare account ID that owns that database. The script also
accepts `CLOUDFLARE_ACCOUNT_ID`; when both names are set, they must agree.

`CLOUDFLARE_ACCESS`, `CLOUDFLARE_SECRET`, and `CLOUDFLARE_S3_URI` are not used by this migration
runner. Keep them for the rest of the application if needed.

The runner loads `.env` relative to `scripts/migrate-d1.mjs`, not relative to the shell's working
directory. Shell/CI environment variables take precedence. Keep the API token server-side and out of
Worker public vars/browser code.

## Commands

```bash
# Read-only: verify the remote target and show pending SQL files.
npm run db:migrate:status

# Write: apply every pending migration directly to remote D1.
npm run db:migrate:remote

# Read-only: verify the complete reader/auth/progress/knowledge/FTS schema.
npm run db:verify:readers
```

The equivalent direct Node commands are:

```bash
node scripts/migrate-d1.mjs --status
node scripts/migrate-d1.mjs --apply
node scripts/migrate-d1.mjs --verify
```

No argument defaults to `--status`; `--dry-run` is an alias for that read-only preview. There are no
confirmation prompts, so only an explicit `--apply` writes migrations.

## Current migration chain

The runner applies top-level `.sql` files in numeric filename order and records each completed file in
`d1_migrations`.

### `0001_reader_accounts.sql`

Creates the prototype reader tables:

```text
reader_users
reader_sessions
reader_bookmarks
reader_login_limits
```

### `0002_verified_identity_progress_knowledge.sql`

Upgrades the reader system with:

- password hash/salt/iteration metadata on `reader_users`,
- `auth_method` on sessions so old prototype sessions can be identified and rejected by normal auth,
- `reader_library_state` for shelf status, last chapter, bounded progress sync counts, and explicit
  resume-open counts,
- versioned spoiler-safe knowledge tables (`story_knowledge_versions`, `story_chapter_sequence`,
  `story_entities`, `story_relations`, `story_events`),
- a D1 FTS5 chapter index and insert trigger,
- a reviewed chapter 1-3 knowledge pilot for `a-regressors-tale-of-cultivation`.

The migration is additive to existing reader data. Old sessions become `prototype`; the application
does not accept them as normal authenticated sessions. Existing bookmarks/users are preserved so an
eligible prototype account can perform the one-time password upgrade flow.

The FTS backfill reads existing `novel-content` rows. Therefore run this migration only after the
normal content schema/data already exists in the target database.

## Runner behavior and safety boundary

1. Validate account ID, database ID, expected database name and API token configuration.
2. Fetch remote database metadata. A name/UUID mismatch stops before migration SQL is sent.
3. Read and sort every `migrations/*.sql` file.
4. Read `d1_migrations` if present. Status mode never creates it.
5. In apply mode, create migration history if necessary and skip already-recorded files.
6. Send each migration intact together with its history insert. The runner never naïvely splits SQL on
   semicolons, so trigger bodies and semicolons inside strings remain intact.
7. Stop on API or SQL failure. Timed-out writes are **not** retried automatically because their remote
   outcome may be unknown.
8. Once both current reader migrations are present, verify password auth columns, reader-state and
   story-knowledge tables/indexes, plus `story_chapter_fts`.

Take a D1 backup/snapshot or establish a recovery path before applying production migrations. Run only
one migrator against a database at a time. Applied migrations are tracked by filename, not checksum;
do not edit or rename a migration after it is recorded—add a new numbered file instead.

A verification failure after migration does not roll back migrations that already completed. Inspect
`--status` and the remote database before deciding how to recover.

## Offline validation

The current migration runner has **22/22 passing** offline tests using an injected Cloudflare HTTP test
double backed by Node's in-memory SQLite engine. The suite executes the actual `0001` and `0002` SQL,
checks the FTS trigger, validates reruns/data preservation, exercises API/configuration failures,
confirms token redaction and no automatic retry, and verifies `.env` loading from another working
directory.

```bash
npm run test:d1-migrations
```

No live Cloudflare account was contacted during those tests and no remote D1 migration was run.

## Official references

- D1 query endpoint and response format: https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/
- Remote database metadata endpoint: https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/
- D1 migration history conventions: https://developers.cloudflare.com/d1/reference/migrations/
- D1 FTS5: https://developers.cloudflare.com/d1/sql-api/sql-statements/#full-text-search
- Node `.env` loader: https://nodejs.org/api/process.html#processloadenvfilepath
