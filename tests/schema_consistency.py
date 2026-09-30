"""Verify canonical schema + numbered migrations against the checked-in reader contract."""
import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
schema_dir = root / "database" / "schema"
migration_dir = root / "database" / "migrations"
base_path = schema_dir / "content-schema.sql"
contract_path = schema_dir / "schema-contract.json"
migration_paths = sorted(migration_dir.glob("*.sql"))

assert migration_paths, "No canonical database migrations found"

db = sqlite3.connect(":memory:")
base = base_path.read_text(encoding="utf-8")
db.executescript(base)
before = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}

# 0001 is intentionally additive/idempotent CREATE TABLE/INDEX DDL.
first_sql = migration_paths[0].read_text(encoding="utf-8")
db.executescript(first_sql)
db.executescript(first_sql)

# Later migrations include one-time ALTER TABLE statements. Production idempotency is
# provided by the migration-history runner, so each numbered file is applied once.
for path in migration_paths[1:]:
    db.executescript(path.read_text(encoding="utf-8"))

contract = json.loads(contract_path.read_text(encoding="utf-8"))
for table, expected in contract.items():
    actual = [row[1] for row in db.execute(f'PRAGMA table_info("{table}")')]
    assert actual == expected, (table, actual, expected)

# Metadata-v2/profile additions are outside the compact reader contract but are release-critical.
characteristic_columns = [row[1] for row in db.execute('PRAGMA table_info("metadata_characteristics")')]
assert "profile_through_chapter" in characteristic_columns, characteristic_columns
assert before.issubset({row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")})

for path in migration_paths:
    sql = path.read_text(encoding="utf-8")
    assert "DROP TABLE" not in sql.upper(), path.name

docs = (root / "docs" / "DATABASE.md").read_text(encoding="utf-8")
for path in migration_paths:
    assert path.name in docs, f"{path.name} missing from docs/DATABASE.md"

print(f"Schema contract + {len(migration_paths)} canonical migrations + documentation: PASS")
