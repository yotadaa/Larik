# Novel D1 database

This document describes the tables created by `migrator.py`, how it stores local Markdown, and how to query the Cloudflare D1 database. The Worker binding is named `DB` in `wrangler.jsonc`. The current repository contains no Worker implementation under `workers/`; the reader in `id/<novel>/index.html` reads Markdown files rather than D1. At present, `migrator.py` is the writer and there is no application-side D1 reader in this checkout.

## Schema

`migrator.py` creates each table with `CREATE TABLE IF NOT EXISTS`. Every table has an automatically generated integer `id` primary key, followed by the text columns below. Column names containing hyphens are intentional and must be double-quoted in SQL. `novel_id` in `novel` uses an underscore; other tables use `novel-id`.

```sql
CREATE TABLE IF NOT EXISTS "novel" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "novel-title" TEXT,
  "novel_id" TEXT,
  "lang" TEXT
);

CREATE TABLE IF NOT EXISTS "novel-content" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "path" TEXT,
  "name" TEXT,
  "type" TEXT,
  "lang" TEXT,
  "novel-id" TEXT,
  "novel-title" TEXT,
  "content" TEXT,
  "chapter-id" TEXT,
  "chapter-title" TEXT,
  "recap" TEXT
);

CREATE TABLE IF NOT EXISTS "characters" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "character-name" TEXT,
  "character-description" TEXT,
  "novel-id" TEXT
);

CREATE TABLE IF NOT EXISTS "continuities" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "content" TEXT,
  "novel-id" TEXT
);

CREATE TABLE IF NOT EXISTS "glossariums" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "source-term" TEXT,
  "canonical-translation" TEXT,
  "type" TEXT,
  "first-seen" TEXT,
  "notes" TEXT,
  "novel-id" TEXT
);

CREATE TABLE IF NOT EXISTS "locations" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "location" TEXT,
  "novel-id" TEXT
);

CREATE TABLE IF NOT EXISTS "terminologies" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "term" TEXT,
  "novel-id" TEXT
);

CREATE TABLE IF NOT EXISTS "qa-log" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "log" TEXT,
  "novel-id" TEXT
);
```

These are the columns the migrator creates; the DDL does not add foreign keys, uniqueness constraints, or secondary indexes. `novel-id` is a text slug shared by a novel and its rows, not a declared foreign key. Re-running `CREATE TABLE IF NOT EXISTS` does not alter an existing table. If the live schema differs from this definition, inspect and migrate it deliberately; the script does not add missing columns to existing tables.

## Table contents and source files

| Table | Row source | Stored data |
|---|---|---|
| `novel` | `NOVEL.md` and the containing language/slug directories | Novel title, slug, and language code. |
| `novel-content` | `chapters/*.md` and same-name files in `recaps/` | One row per chapter, including relative path, filename, extension, full Markdown, first Markdown heading, and recap (empty string if absent). |
| `characters` | `characters.md` | One row per bullet with a bold character name, dash, and description. |
| `continuities` | `continuity.md` | One row per bullet. |
| `glossariums` | `glossarium.md` | Intended for glossary table rows with source term, canonical translation, type, first-seen, and notes. The current parser handles prose bullet formats for memory files and skips this Markdown table, so this table is not populated from the current glossary file. |
| `locations` | `locations.md` | One row per bold location bullet; the stored `location` contains the label and description. |
| `terminologies` | `terminology.md` | One row per bullet; a bold `Term:` prefix is retained along with its description. |
| `qa-log` | `qa-log.md` | One row per bullet. |

All memory rows include the novel slug in `novel-id`. All data columns are nullable text in the current DDL. The generated `id` is omitted from inserts.

## Fetching data

### Cloudflare Wrangler CLI

Run from the repository root. Use `--remote` to query the deployed D1 database rather than a local development database:

```sh
npx wrangler d1 execute novel --remote --command='SELECT "novel-title", "novel_id", "lang" FROM "novel";'

npx wrangler d1 execute novel --remote --command='SELECT "chapter-id", "chapter-title", "content", "recap" FROM "novel-content" WHERE "novel-id" = "a-regressors-tale-of-cultivation" ORDER BY "chapter-id";'
```

Quote hyphenated identifiers with double quotes. For production code, pass values as bound parameters rather than interpolating user input into SQL.

### Cloudflare Worker binding

The Wrangler config binds D1 as `DB`. A Worker can query through that binding, for example:

```ts
interface Env {
  DB: D1Database;
}

const novel = await env.DB
  .prepare('SELECT "novel-title", "novel_id", "lang" FROM "novel" WHERE "novel_id" = ?')
  .bind("a-regressors-tale-of-cultivation")
  .first();

const chapters = await env.DB
  .prepare('SELECT "chapter-id", "chapter-title", "content", "recap" FROM "novel-content" WHERE "novel-id" = ? ORDER BY "chapter-id"')
  .bind("a-regressors-tale-of-cultivation")
  .all();
```

`Env` above is an example of the binding type; no Worker route currently exists in this repository to serve these queries. A route should validate the requested novel slug and chapter identifier, bind them as parameters, and return the selected fields. Do not expose unrestricted SQL or write access from a public route.

### Python Cloudflare SDK

The migrator uses the D1 API. For a read, use the same credentials and database ID as its `.env` configuration:

```python
from cloudflare import Cloudflare

client = Cloudflare(api_token=API_TOKEN)
response = client.d1.database.query(
    database_id=DATABASE_ID,
    account_id=ACCOUNT_ID,
    sql='SELECT "chapter-id", "chapter-title" FROM "novel-content" WHERE "novel-id" = ?',
    params=["a-regressors-tale-of-cultivation"],
)
```

The Cloudflare SDK response is paginated. Inspect the SDK's `result`/`results` structure when consuming rows; do not assume a PRAGMA response includes column metadata. The current migrator uses its configured column list instead of D1 PRAGMA results.

## Duplicate handling and migration

Run a local record-count preview from the migration directory:

```sh
python migrator.py --dry-run
```

Run the migration with `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ID`, and `DATABASE_ID` in `scripts/sqilte-migration/.env`:

```sh
python migrator.py
```

For each candidate record, `migration.md` is checked first. It stores the table, a SHA-256 fingerprint of all source fields (excluding generated `id`), result (`inserted` or `duplicate`), and UTC timestamp. A matching checkpoint entry skips the row before any per-row D1 query. The checkpoint is scoped to the selected Cloudflare account/database using a hash, not the credentials themselves; a different target starts with an empty checkpoint. If no checkpoint entry exists, the script compares all configured non-`id` fields against D1 and inserts only if no exact match exists. It writes the checkpoint after each successful insert or duplicate check, so a crash before that write merely causes the row to be checked again. Changed source rows have a different fingerprint and go through the D1 check. The script does not update a row when the local Markdown changes. `ensure_tables` creates absent tables but does not repair or migrate existing table definitions. Remove `migration.md` only when intentionally forcing a full D1 recheck; doing so increases D1 query calls but still does not insert exact duplicates.

## Intended consumers

- `novel` supplies the title and language for a novel landing page or catalog.
- `novel-content` supplies chapter bodies and recaps to a chapter reader.
- `characters`, `locations`, and `terminologies` supply reference/atlas views.
- `continuities` supplies translation context for future chapters.
- `glossariums` supplies canonical term lookup after the Markdown table parser is added.
- `qa-log` supplies recorded translation decisions and known source issues.

These are data roles, not implemented D1-backed pages. The current reader HTML loads the local Markdown files directly; integrating these tables requires adding Worker routes and changing a consumer to fetch those routes.
