"""Verify actual schema/migrations against the checked-in contract and documentation."""
import json
import sqlite3
from pathlib import Path
root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
base = (root / "scripts/content-schema.sql").read_text()
migration = (root / "migrations/0001_reader_accounts.sql").read_text()
db.executescript(base)
before = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
db.executescript(migration)
db.executescript(migration)  # idempotent DDL
contract = json.loads((root / "scripts/schema-contract.json").read_text())
for table, expected in contract.items():
    actual = [r[1] for r in db.execute(f'PRAGMA table_info("{table}")')]
    assert actual == expected, (table, actual, expected)
assert before.issubset({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")})
docs = (root / "docs/DATABASE.md").read_text()
assert base in docs and migration in docs
assert "DROP TABLE" not in migration.upper()
print("Schema contract, additive/idempotent migration, and database documentation: PASS")
