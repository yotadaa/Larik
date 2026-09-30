# SQLite Model

Default database: `storage/story.sqlite3`.

Every table contains both `novel_id` and `lang_id`. The same database can therefore store multiple novels and multiple translations of each novel.

## Tables

| Table | Purpose |
|---|---|
| `chapters` | Final translated chapter + compact continuity summary + source/model/prompt fingerprints |
| `entities` | Chapter-versioned universal entity profiles |
| `relationships` | Chapter-versioned relationship state between any two entities |
| `terminology` | Canonical source→target translation rules |
| `glossary` | In-world meaning/explanation |
| `arcs` | Broad narrative arc state |
| `style_profiles` | Versioned literary/style/voice contract |
| `translation_runs` | Operational run history |

## Relationship evolution

```sql
SELECT chapter_number, name, description, direction, status
FROM relationships
WHERE novel_id = ?
  AND lang_id = ?
  AND relationship_id = ?
ORDER BY chapter_number;
```

## Latest entity state as of a chapter

```sql
SELECT e.*
FROM entities e
WHERE e.novel_id = ?
  AND e.lang_id = ?
  AND e.entity_id = ?
  AND e.chapter_number = (
    SELECT MAX(chapter_number)
    FROM entities
    WHERE novel_id = e.novel_id
      AND lang_id = e.lang_id
      AND entity_id = e.entity_id
      AND chapter_number <= ?
  );
```

The runtime repository additionally excludes metadata belonging to `stale` chapter translations.

## Idempotency

Reprocessing chapter N:

1. marks chapter N+1 onward stale;
2. replaces only metadata snapshots belonging to chapter N;
3. merges incomplete new snapshots with the latest valid prior snapshot where safe;
4. writes the final translation + metadata in one transaction.

No `INSERT OR REPLACE` is used as a generic repository strategy; writes are explicit per table so accidental column loss is avoided.

## Legacy database protection

The older project used tables with some of the same names but incompatible columns. Initialization checks for the new temporal entity columns and refuses to mutate a legacy database. Use a fresh `DATABASE_PATH` (the default is already new) rather than pointing this version at the previous 17-ledger database.
