#!/usr/bin/env python3
"""Compatibility entry point. Canonical database tooling lives in database/migrator.py."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.migrator import main

if __name__ == "__main__":
    raise SystemExit(main())
