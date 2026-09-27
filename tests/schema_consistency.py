from __future__ import annotations

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATOR = ROOT / "scripts" / "sqilte-migration" / "migrator.py"
DATABASE_MD = ROOT / "scripts" / "sqilte-migration" / "DATABASE.md"

module = ast.parse(MIGRATOR.read_text(encoding="utf-8"))
tables = None
for node in module.body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "TABLES" for t in node.targets):
        tables = ast.literal_eval(node.value)
        break
if tables is None:
    raise SystemExit("Could not find TABLES in migrator.py")

text = DATABASE_MD.read_text(encoding="utf-8")
blocks = re.findall(r'CREATE TABLE IF NOT EXISTS "([^"]+)" \((.*?)\n\);', text, flags=re.S)
documented = {}
for table, body in blocks:
    cols = re.findall(r'^\s*"([^"]+)"\s+(?:INTEGER|TEXT)', body, flags=re.M)
    documented[table] = tuple(c for c in cols if c != "id")

if set(tables) != set(documented):
    raise SystemExit(f"Table mismatch: migrator={sorted(tables)} docs={sorted(documented)}")
for table, columns in tables.items():
    if tuple(columns) != documented[table]:
        raise SystemExit(f"Column mismatch for {table}: migrator={columns} docs={documented[table]}")

print("DATABASE.md and migrator.py schema declarations: PASS")
