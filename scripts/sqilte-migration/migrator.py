from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from cloudflare import Cloudflare

ROOT = Path(__file__).resolve().parents[2]
TABLES = {
    "novel": ("novel-title", "novel_id", "lang"),
    "novel-content": ("path", "name", "type", "lang", "novel-id", "novel-title", "content", "chapter-id", "chapter-title", "recap"),
    "characters": ("character-name", "character-description", "novel-id"),
    "continuities": ("content", "novel-id"),
    "glossariums": ("source-term", "canonical-translation", "type", "first-seen", "notes", "novel-id"),
    "locations": ("location", "novel-id"),
    "terminologies": ("term", "novel-id"),
    "qa-log": ("log", "novel-id"),
}


def query(client, database_id: str, account_id: str, sql: str, params=None):
    return client.d1.database.query(
        database_id=database_id, account_id=account_id, sql=sql, params=params or []
    )


def rows(response):
    for result in response:
        data = getattr(result, "results", None)
        if data is None and isinstance(result, dict):
            data = result.get("results", [])
        yield from (data or [])


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


CHECKPOINT = Path(__file__).resolve().with_name("migration.md")


def record_fingerprint(table, record):
    values = {key: record[key] for key in sorted(record) if normalize(key) != "id"}
    payload = json.dumps([table, values], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def read_checkpoint(target):
    lines = CHECKPOINT.read_text(encoding="utf-8").splitlines()
    recorded_target = next((line.removeprefix("Target: ") for line in lines if line.startswith("Target: ")), None)
    if recorded_target != target:
        return {}
    completed = {}
    for line in lines:
        if not line.startswith("| ") or line.startswith("| Table"):
            continue
        cells = [cell.strip() for cell in line.strip("| ").split("|")]
        if len(cells) == 4 and cells[2] in {"inserted", "duplicate"}:
            completed[(cells[0], cells[1])] = (cells[2], cells[3])
    return completed


def write_checkpoint(completed, target):
    lines = [
        "# Migration checkpoint", "",
        f"Target: {target}", "",
        "This file is managed by `migrator.py`. Each entry records a completed per-row check keyed by table and SHA-256 fingerprint of the source values (excluding the generated `id`). Entries marked `inserted` or `duplicate` are not queried again on later runs. If a source row changes, its fingerprint changes and it is checked again.", "",
        "The script updates this file after each successful insert or confirmed duplicate. If a run stops before the checkpoint is written, that row is safely checked against D1 again on restart.", "",
        "## Completed rows", "",
        "| Table | Fingerprint | Status | Checked at (UTC) |",
        "|---|---|---|---|",
    ]
    for (table, fingerprint), (status, timestamp) in sorted(completed.items()):
        lines.append(f"| {table} | {fingerprint} | {status} | {timestamp} |")
    temporary = CHECKPOINT.with_suffix(".md.tmp")
    temporary.write_text("\n".join(lines) + "\n", encoding="utf-8")
    temporary.replace(CHECKPOINT)
def table_columns(client, database_id, account_id, table):
    # The Cloudflare SDK currently returns empty result rows for PRAGMA in D1.
    # Use the explicitly configured table fields instead of treating that as an
    # empty or ID-only schema.
    try:
        return TABLES[table]
    except KeyError as exc:
        raise RuntimeError(f"No configured columns for table {table!r}") from exc


def ensure_tables(client, database_id, account_id):
    for table, columns in TABLES.items():
        definitions = ['"id" INTEGER PRIMARY KEY AUTOINCREMENT']
        definitions.extend(f'"{column}" TEXT' for column in columns if normalize(column) != "id")
        query(client, database_id, account_id,
              f'CREATE TABLE IF NOT EXISTS "{table}" ({", ".join(definitions)})')


def insert_if_missing(client, database_id, account_id, table, data):
    columns = table_columns(client, database_id, account_id, table)
    names = [column for column in columns if normalize(column) != "id"]
    by_normalized = {normalize(column): column for column in names}
    supplied = {by_normalized[normalize(key)]: value for key, value in data.items()
                if normalize(key) in by_normalized}
    if not supplied:
        raise RuntimeError(f"No matching columns for table {table!r}; check TABLES")
    params = [supplied.get(name) for name in names]
    where = " AND ".join(f'"{name}" IS ?' for name in names)
    found = rows(query(client, database_id, account_id,
                       f'SELECT 1 FROM "{table}" WHERE {where} LIMIT 1', params))
    if next(found, None) is not None:
        return False
    insert_names = list(supplied)
    quoted = ", ".join(f'"{name}"' for name in insert_names)
    placeholders = ", ".join("?" for _ in insert_names)
    query(client, database_id, account_id,
          f'INSERT INTO "{table}" ({quoted}) VALUES ({placeholders})',
          [supplied[name] for name in insert_names])
    return True


def parse_markdown_table(path: Path):
    lines = path.read_text(encoding="utf-8").splitlines()
    header = None
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) > 1 and all(re.fullmatch(r":?-+:?", cell) for cell in cells):
            continue
        if header is None and len(cells) > 1 and line.lstrip().startswith("|"):
            header = [normalize(cell) for cell in cells]
            continue
        if header and line.lstrip().startswith("|"):
            values = [cell.strip() for cell in line.strip().strip("|").split("|")]
            if len(values) == len(header):
                yield dict(zip(header, values))


def markdown_records(path: Path, table):
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\s*-\s+(.*)$", line)
        if not match:
            continue
        text = match.group(1).strip()
        if table == "characters":
            parts = re.match(r"\*\*(.+?)\*\*\s*[—–-]\s*(.*)", text)
            if parts:
                yield {"character-name": parts.group(1), "character-description": parts.group(2)}
        elif table == "locations":
            parts = re.match(r"\*\*(.+?)\*\*\s*[—–-]\s*(.*)", text)
            if parts:
                yield {"location": f"{parts.group(1)} — {parts.group(2)}"}
        elif table == "terminologies":
            parts = re.match(r"\*\*(.+?):\*\*\s*(.*)", text)
            term = parts.group(1) if parts else text
            description = parts.group(2) if parts else ""
            yield {"term": f"{term}: {description}" if description else term}
        elif table == "continuities":
            yield {"content": text}
        elif table == "qa-log":
            yield {"log": text}
        elif table == "glossariums":
            continue
        else:
            raise ValueError(f"Unsupported memory table {table!r}")


def header_title(content):
    match = re.search(r"(?m)^#\s+(.+?)\s*$", content)
    return match.group(1).strip() if match else ""


def novel_title(novel_dir):
    content = (novel_dir / "NOVEL.md").read_text(encoding="utf-8")
    return header_title(content).removeprefix("Chapter ").strip()


def build_records(novel_dir: Path):
    lang = novel_dir.parent.name
    novel_id = novel_dir.name
    title = novel_title(novel_dir)
    yield "novel", {"novel-title": title, "novel_id": novel_id, "lang": lang}
    for chapter in sorted((novel_dir / "chapters").glob("*.md")):
        content = chapter.read_text(encoding="utf-8")
        recap_path = novel_dir / "recaps" / chapter.name
        yield "novel-content", {
            "path": chapter.resolve().relative_to(ROOT).as_posix(), "name": chapter.name,
            "type": chapter.suffix.lstrip("."), "lang": lang, "novel-id": novel_id,
            "novel-title": title, "content": content, "chapter-id": chapter.name,
            "chapter-title": header_title(content),
            "recap": recap_path.read_text(encoding="utf-8") if recap_path.exists() else "",
        }
    for filename, table in (("characters.md", "characters"), ("continuity.md", "continuities"),
                            ("glossarium.md", "glossariums"), ("locations.md", "locations"),
                            ("terminology.md", "terminologies"), ("qa-log.md", "qa-log")):
        path = novel_dir / filename
        if not path.exists():
            continue
        for record in markdown_records(path, table):
            record["novel-id"] = novel_id
            yield table, record


def main():
    parser = argparse.ArgumentParser(description="Export local novel Markdown into Cloudflare D1")
    parser.add_argument("novel_dir", nargs="?", default="id/a-regressors-tale-of-cultivation", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="report planned records without connecting to D1")
    args = parser.parse_args()
    novel_dir = (ROOT / args.novel_dir).resolve()
    if not novel_dir.is_dir() or not (novel_dir / "NOVEL.md").is_file():
        parser.error(f"not a novel directory with NOVEL.md: {novel_dir}")
    records = list(build_records(novel_dir))
    if args.dry_run:
        from collections import Counter
        print(f"Would inspect {len(records)} records: {dict(Counter(table for table, _ in records))}")
        return

    import os
    load_dotenv(Path(__file__).resolve().parent / ".env")
    load_dotenv(ROOT / ".env")
    missing = [key for key in ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ID", "DATABASE_ID") if not os.environ.get(key)]
    if missing:
        raise SystemExit(f"Missing required environment variable(s): {', '.join(missing)}. Check scripts/sqilte-migration/.env")
    client = Cloudflare(api_token=os.environ["CLOUDFLARE_API_TOKEN"])
    account_id = os.environ["CLOUDFLARE_ID"]
    database_id = os.environ["DATABASE_ID"]
    ensure_tables(client, database_id, account_id)
    target = hashlib.sha256(f"{account_id}:{database_id}".encode("utf-8")).hexdigest()
    completed = read_checkpoint(target)
    inserted = duplicates = checkpoint_skipped = 0
    for index, (table, record) in enumerate(records, start=1):
        fingerprint = record_fingerprint(table, record)
        key = (table, fingerprint)
        label = str(record.get("name") or record.get("chapter-id") or record.get("novel-title") or record.get("character-name") or record.get("location") or record.get("term") or record.get("content") or record.get("log") or fingerprint[:12]).replace("\n", " ")[:100]
        if key in completed:
            checkpoint_skipped += 1
            print(f"[{index}/{len(records)}] CHECKPOINT {table}: {label}", flush=True)
            continue
        was_inserted = insert_if_missing(client, database_id, account_id, table, record)
        status = "inserted" if was_inserted else "duplicate"
        completed[key] = (status, datetime.now(timezone.utc).isoformat(timespec="seconds"))
        write_checkpoint(completed, target)
        if was_inserted:
            inserted += 1
            print(f"[{index}/{len(records)}] INSERTED {table}: {label}", flush=True)
        else:
            duplicates += 1
            print(f"[{index}/{len(records)}] D1 DUPLICATE {table}: {label}", flush=True)
    print(f"Migration complete: {inserted} inserted, {duplicates} D1 duplicates skipped, {checkpoint_skipped} checkpoint rows skipped")


if __name__ == "__main__":
    main()
