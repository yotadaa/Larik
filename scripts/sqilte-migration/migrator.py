#!/usr/bin/env python3
"""Project-facing multi-series Markdown seeder/sync entry point.

With no series path arguments this discovers every compatible direct child of id/.
The canonical parser/writer implementation lives in database/migrator.py so seed,
sync and validation always use the same metadata contract.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.migrator import main

if __name__ == "__main__":
    raise SystemExit(main())
