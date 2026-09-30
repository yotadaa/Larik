#!/usr/bin/env python3
"""Compatibility wrapper for translating one chapter at a time."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.presentations.cli import main as cli_main


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Translate one chapter using the Clean Architecture pipeline.")
    parser.add_argument("novel_id")
    parser.add_argument("chapter", type=int)
    parser.add_argument("--lang-target", default="id")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--allow-context-gap", action="store_true")
    args = parser.parse_args(argv)
    forwarded = [
        "--root", str(ROOT), "translate", args.novel_id,
        "--lang", args.lang_target, "--start", str(args.chapter), "--end", str(args.chapter),
    ]
    if args.force:
        forwarded.append("--force")
    if args.allow_context_gap:
        forwarded.append("--allow-context-gap")
    return cli_main(forwarded)


if __name__ == "__main__":
    raise SystemExit(main())
