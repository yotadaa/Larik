from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SERIES_ROOT = ROOT / "id"

CANONICAL_TABLES = [
    "metadata_documents",
    "metadata_chapters",
    "metadata_entity_history",
    "metadata_entities",
    "metadata_aliases",
    "metadata_relationships",
    "metadata_facts",
    "metadata_events",
    "metadata_states",
    "metadata_scenes",
    "metadata_arcs",
    "metadata_cycles",
    "metadata_characteristics",
    "metadata_glossary",
    "metadata_memory_entries",
    "metadata_integrity_issues",
]

EPHEMERAL_DOCS = {"TEST_REPORT.md"}
MEMORY_FILES = {
    "characters.md": "characters",
    "locations.md": "locations",
    "continuity.md": "continuities",
    "terminology.md": "terminologies",
    "qa-log.md": "qa-log",
}


def is_series_dir(path: Path) -> bool:
    """Return True when a direct child of id/ has the reader-series layout."""
    return (
        path.is_dir()
        and not path.name.startswith(".")
        and (path / "NOVEL.md").is_file()
        and (path / "chapter-index.md").is_file()
        and (path / "chapters").is_dir()
    )


def discover_series_dirs(series_root: Path = DEFAULT_SERIES_ROOT) -> list[Path]:
    """Discover every series under id/ that follows the canonical folder layout."""
    if not series_root.is_dir():
        return []
    return sorted(
        (path.resolve() for path in series_root.iterdir() if is_series_dir(path)),
        key=lambda path: path.name.casefold(),
    )


def resolve_series_dirs(requested: list[str], root: Path = ROOT) -> list[Path]:
    """Resolve explicit series paths, or all valid direct children of root/id when omitted."""
    if requested:
        result: list[Path] = []
        for raw in requested:
            path = Path(raw)
            path = path.resolve() if path.is_absolute() else (root / path).resolve()
            if not is_series_dir(path):
                raise ValueError(f"not a series directory with NOVEL.md, chapter-index.md, and chapters/: {path}")
            result.append(path)
    else:
        result = discover_series_dirs(root / "id")
        if not result:
            raise ValueError(f"no valid series directories found under {root / 'id'}")

    seen: set[str] = set()
    duplicate_ids: set[str] = set()
    for path in result:
        novel_id = path.name
        if novel_id in seen:
            duplicate_ids.add(novel_id)
        seen.add(novel_id)
    if duplicate_ids:
        raise ValueError(f"duplicate novel id(s) resolved: {', '.join(sorted(duplicate_ids))}")
    return result


def clean_header(value: str) -> str:
    value = html.unescape(value).replace("`", "").strip().lower()
    value = value.replace("#", " number ").replace("/", " ")
    value = re.sub(r"[^a-z0-9]+", "_", value).strip("_")
    return value


def clean_cell(value: str) -> str:
    return html.unescape(value.strip())


def split_markdown_row(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    # The corpus uses &#124; for literal pipes inside cells, so plain splitting is safe.
    return [clean_cell(part) for part in line.split("|")]


def is_separator(cells: list[str]) -> bool:
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells)


@dataclass
class TableRow:
    source_line: int
    header: tuple[str, ...]
    values: dict[str, str]


def markdown_table_rows(path: Path) -> list[TableRow]:
    """Parse every pipe table and retain the latest header for headerless continuation rows.

    Optional metadata documents may be introduced progressively per series. Missing optional
    tables therefore produce no rows instead of preventing every other series under id/ from syncing.
    """
    if not path.is_file():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    result: list[TableRow] = []
    header: tuple[str, ...] | None = None
    for index, line in enumerate(lines):
        if not line.lstrip().startswith("|"):
            continue
        cells = split_markdown_row(line)
        next_cells = split_markdown_row(lines[index + 1]) if index + 1 < len(lines) and lines[index + 1].lstrip().startswith("|") else []
        if next_cells and is_separator(next_cells):
            header = tuple(clean_header(cell) for cell in cells)
            continue
        if is_separator(cells) or header is None or len(cells) != len(header):
            continue
        result.append(TableRow(index + 1, header, dict(zip(header, cells))))
    return result


def table_rows(path: Path, required: Iterable[str]) -> list[TableRow]:
    wanted = set(required)
    return [row for row in markdown_table_rows(path) if wanted.issubset(row.values)]


def int_value(value: Any) -> int | None:
    if value is None:
        return None
    text = clean_cell(str(value))
    if not text or text.lower() in {"unknown", "null", "none", "—", "-"}:
        return None
    match = re.search(r"-?\d+", text.replace(",", ""))
    return int(match.group()) if match else None


def json_list(value: str) -> str:
    parts = [item.strip() for item in re.split(r"\s*[,;]\s*", value or "") if item.strip()]
    return json.dumps(parts, ensure_ascii=False)


def list_value(value: str) -> list[str]:
    return json.loads(json_list(value))


def strip_markdown_label(value: str) -> str:
    value = clean_cell(value)
    value = re.sub(r"\*\*(.+?)\*\*", r"\1", value)
    value = re.sub(r"`(.+?)`", r"\1", value)
    return value.strip()


def first_heading(content: str) -> str:
    match = re.search(r"(?m)^#\s+(.+?)\s*$", content)
    return strip_markdown_label(match.group(1)) if match else ""


def parse_frontmatter(content: str) -> dict[str, str]:
    if not content.startswith("---\n"):
        return {}
    end = content.find("\n---", 4)
    if end < 0:
        return {}
    data: dict[str, str] = {}
    for line in content[4:end].splitlines():
        if ":" not in line or line.startswith((" ", "\t")):
            continue
        key, value = line.split(":", 1)
        data[clean_header(key)] = value.strip().strip('"\'')
    return data


def markdown_link(value: str) -> tuple[str, str] | None:
    match = re.search(r"\[([^\]]+)\]\(([^)]+)\)", html.unescape(value or ""))
    return (match.group(1).strip(), match.group(2).strip()) if match else None


def wiki_targets(value: str) -> list[str]:
    text = html.unescape(value or "")
    targets: list[str] = []
    for raw in re.findall(r"\[\[([^\]]+)\]\]", text):
        target = raw.split("|", 1)[0].split("#", 1)[0].strip()
        if target and target not in targets:
            targets.append(target)
    return targets


def content_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def source_hash(files: Iterable[Path], fallback_base: Path | None = None) -> str:
    digest = hashlib.sha256()
    for path in sorted(files, key=lambda item: item.as_posix()):
        try:
            logical_path = path.resolve().relative_to(ROOT).as_posix()
        except ValueError:
            base = fallback_base.resolve() if fallback_base is not None else path.parent.resolve()
            logical_path = path.resolve().relative_to(base).as_posix()
        digest.update(logical_path.encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def chapter_number(path: Path) -> int | None:
    match = re.match(r"(\d+)", path.name)
    return int(match.group(1)) if match else None


def first_bold_name(text: str) -> str:
    match = re.search(r"\*\*(.+?)\*\*", text or "")
    return strip_markdown_label(match.group(1)) if match else ""


def entity_type_from_id(entity_id: str, explicit: str = "") -> str:
    if explicit.strip():
        return explicit.strip().lower().replace(" ", "_")
    prefix = entity_id.split(":", 1)[0].lower()
    return {
        "char": "character", "loc": "location", "org": "organization", "item": "item",
        "tech": "technique", "realm": "realm", "concept": "concept", "species": "species",
        "cycle": "cycle", "entity": "aspect",
    }.get(prefix, prefix or "other")


@dataclass
class Issue:
    severity: str
    code: str
    source_file: str
    record_id: str
    detail: str

    def as_row(self, novel_id: str, ordinal: int) -> dict[str, Any]:
        seed = f"{self.severity}|{self.code}|{self.source_file}|{self.record_id}|{self.detail}|{ordinal}"
        return {
            "novel_id": novel_id,
            "issue_id": hashlib.sha256(seed.encode()).hexdigest()[:24],
            "severity": self.severity,
            "code": self.code,
            "source_file": self.source_file,
            "record_id": self.record_id,
            "detail": self.detail,
        }


class SnapshotBuilder:
    def __init__(self, novel_dir: Path):
        self.novel_dir = novel_dir
        self.novel_id = novel_dir.name
        self.lang = novel_dir.parent.name
        self.documents = sorted(path for path in novel_dir.glob("*.md") if path.is_file())
        self.chapters = sorted((novel_dir / "chapters").glob("*.md"))
        self.recaps = {path.name: path for path in (novel_dir / "recaps").glob("*.md")}
        self.chapter_by_number: dict[int, str] = {}
        self.chapter_by_stem: dict[str, str] = {}
        self.chapter_status: dict[int, str] = {}
        self.issues: list[Issue] = []
        self.tables: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.legacy: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.title = first_heading((novel_dir / "NOVEL.md").read_text(encoding="utf-8"))

    def issue(self, severity: str, code: str, source: str, record: str, detail: str):
        self.issues.append(Issue(severity, code, source, record, detail))

    def source_chapter(self, evidence: str, fallback: int | None = None) -> str:
        for target in wiki_targets(evidence):
            stem = Path(target).stem
            if stem in self.chapter_by_stem:
                return self.chapter_by_stem[stem]
        return self.chapter_by_number.get(fallback or -1, "")

    def reviewed(self, chapter: int | None) -> int:
        return int(bool(chapter) and self.chapter_status.get(int(chapter)) == "reviewed")

    def build_chapters(self):
        actual: dict[int, dict[str, Any]] = {}
        for path in self.chapters:
            number = chapter_number(path)
            if number is None:
                self.issue("error", "invalid_chapter_filename", "chapters", path.name, "Chapter filename has no numeric prefix.")
                continue
            content = path.read_text(encoding="utf-8")
            front = parse_frontmatter(content)
            chapter_id = path.name
            title = front.get("translated_title") or re.sub(r"^Bab\s+\d+\s*[—-]\s*", "", first_heading(content), flags=re.I)
            actual[number] = {"path": path, "content": content, "chapter_id": chapter_id, "title": title}
            self.chapter_by_number[number] = chapter_id
            self.chapter_by_stem[path.stem] = chapter_id

        index_rows = table_rows(self.novel_dir / "chapter-index.md", {"number", "chapter", "status", "update", "metadata", "recap"})
        seen_numbers: set[int] = set()
        for row in index_rows:
            number = int_value(row.values["number"])
            if number is None:
                continue
            seen_numbers.add(number)
            chapter_link = markdown_link(row.values["chapter"])
            recap_link = markdown_link(row.values["recap"])
            indexed_path = chapter_link[1] if chapter_link else ""
            indexed_id = Path(indexed_path).name if indexed_path else self.chapter_by_number.get(number, "")
            found = actual.get(number)
            chapter_id = found["chapter_id"] if found else indexed_id
            title = found["title"] if found else (chapter_link[0] if chapter_link else strip_markdown_label(row.values["chapter"]))
            metadata_status = row.values["metadata"].strip().lower()
            self.chapter_status[number] = metadata_status
            indexed_recap_name = Path(recap_link[1]).name if recap_link else ""
            actual_recap_name = found["chapter_id"] if found and found["chapter_id"] in self.recaps else ""
            recap_name = actual_recap_name or indexed_recap_name or (chapter_id if chapter_id else "")
            recap_exists = bool(recap_name and recap_name in self.recaps)
            if found and indexed_recap_name and indexed_recap_name != recap_name:
                self.issue("warning", "chapter_index_recap_mismatch", "chapter-index.md", str(number), f"Index points to recap {indexed_recap_name}; actual matching recap is {recap_name or 'missing'}.")
            if found and indexed_id and indexed_id != found["chapter_id"]:
                self.issue("warning", "chapter_index_path_mismatch", "chapter-index.md", str(number), f"Index points to {indexed_id}; actual file is {found['chapter_id']}.")
            if not found:
                self.issue("warning", "indexed_chapter_missing", "chapter-index.md", str(number), f"Chapter {number} is indexed but no chapter file exists.")
            if found and not recap_exists:
                self.issue("warning", "chapter_recap_missing", "chapter-index.md", str(number), f"Actual chapter {found['chapter_id']} has no matching recap file.")
            self.tables["metadata_chapters"].append({
                "novel_id": self.novel_id,
                "chapter_number": number,
                "chapter_id": chapter_id or f"missing-{number:03d}.md",
                "title": title,
                "translation_status": row.values["status"],
                "update_status": row.values["update"],
                "metadata_status": metadata_status,
                "recap_path": f"recaps/{recap_name}" if recap_name else (recap_link[1] if recap_link else ""),
                "chapter_path": indexed_path,
                "content_exists": int(found is not None),
                "recap_exists": int(recap_exists),
                "source_hash": content_hash(found["content"]) if found else "",
            })
        for number, found in sorted(actual.items()):
            if number not in seen_numbers:
                self.chapter_status[number] = "unreviewed"
                self.issue("warning", "chapter_not_indexed", "chapters", found["chapter_id"], "Chapter file exists but chapter-index.md has no row.")
                self.tables["metadata_chapters"].append({
                    "novel_id": self.novel_id, "chapter_number": number, "chapter_id": found["chapter_id"], "title": found["title"],
                    "translation_status": parse_frontmatter(found["content"]).get("status", "translated"), "update_status": "", "metadata_status": "unreviewed",
                    "recap_path": f"recaps/{found['chapter_id']}", "chapter_path": f"chapters/{found['chapter_id']}",
                    "content_exists": 1, "recap_exists": int(found["chapter_id"] in self.recaps), "source_hash": content_hash(found["content"]),
                })
        self.tables["metadata_chapters"].sort(key=lambda item: item["chapter_number"])

    def build_documents(self):
        for path in self.documents:
            content = path.read_text(encoding="utf-8")
            self.tables["metadata_documents"].append({
                "novel_id": self.novel_id, "filename": path.name, "title": first_heading(content), "content": content, "content_hash": content_hash(content)
            })

    def build_aliases(self):
        rows = table_rows(self.novel_dir / "aliases.md", {"id", "alias", "entity_id", "kind", "reveal_chapter", "status", "evidence", "notes"})
        aliases_by_entity: dict[str, list[str]] = defaultdict(list)
        for row in rows:
            v = row.values
            reveal = int_value(v.get("reveal_chapter"))
            aliases_by_entity[v["entity_id"]].append(v["alias"])
            self.tables["metadata_aliases"].append({
                "novel_id": self.novel_id, "alias_id": v["id"], "alias": v["alias"], "entity_id": v["entity_id"], "alias_kind": v["kind"],
                "valid_from_chapter": int_value(v.get("valid_from")), "valid_to_chapter": int_value(v.get("valid_to")), "reveal_chapter": reveal,
                "status": v["status"], "evidence": v["evidence"], "notes": v["notes"], "source_chapter_id": self.source_chapter(v["evidence"], reveal), "reviewed": self.reviewed(reveal),
            })
        return aliases_by_entity

    def build_characteristics(self):
        rows = markdown_table_rows(self.novel_dir / "characteristics.md")
        descriptions: dict[str, str] = {}
        source_row = 0
        for row in rows:
            v = row.values
            if "entity_id" not in v or "type" not in v or "canonical_name" not in v:
                continue
            source_row += 1
            detailed = "physical_form" in v
            profile_kind = "detailed" if detailed else "registry"
            first_seen = int_value(v.get("first_seen"))
            snapshot_key = next((key for key in v if key.startswith("characteristic_as_of_ch")), "")
            snapshot_chapter = int_value(snapshot_key.removeprefix("characteristic_as_of_ch")) if snapshot_key else None
            # A detailed profile is cumulative through its as-of chapter, so exposing it at first_seen
            # would leak later knowledge. Registry-only rows contain no later biography and become
            # available at first_seen. Store the boundary explicitly for D1/query-side filtering.
            profile_through = snapshot_chapter if detailed else first_seen
            item = {
                "novel_id": self.novel_id, "source_row": source_row, "entity_id": v["entity_id"], "profile_kind": profile_kind,
                "entity_type": v["type"], "canonical_name": v["canonical_name"], "first_seen_chapter": first_seen,
                "profile_through_chapter": profile_through,
                "physical_form": v.get("physical_form", ""), "temperament_or_properties": v.get("temperament_or_properties", ""),
                "abilities_or_role": v.get("abilities_or_role", ""), "relationships_status": v.get("relationships_status", ""),
                "characteristic_as_of": v.get(snapshot_key, "") if snapshot_key else "", "scope": v.get("cakupan", ""), "evidence": v.get("evidence", ""),
            }
            self.tables["metadata_characteristics"].append(item)
            if detailed:
                parts = []
                profile_fields = [
                    ("Form", "physical_form"),
                    ("Properties", "temperament_or_properties"),
                    ("Abilities / role", "abilities_or_role"),
                    ("Relationships / status", "relationships_status"),
                ]
                if snapshot_key:
                    profile_fields.append((f"Snapshot through Ch. {snapshot_chapter or '?'}", snapshot_key))
                for label, key in profile_fields:
                    value = v.get(key, "").strip()
                    if value and value.lower() not in {"tidak berlaku", "tidak disebutkan"}:
                        parts.append(f"**{label}:** {value}")
                descriptions[v["entity_id"]] = "\n\n".join(parts)
        return descriptions

    def build_entities(self, aliases_by_entity: dict[str, list[str]], descriptions: dict[str, str]):
        rows = table_rows(self.novel_dir / "entities.md", {"id", "type", "canonical_name", "first_seen", "reveal", "status", "evidence", "notes"})
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for source_row, row in enumerate(rows, start=1):
            v = row.values
            record = {
                "novel_id": self.novel_id, "source_row": source_row, "entity_id": v["id"], "entity_type": entity_type_from_id(v["id"], v["type"]),
                "canonical_name": v["canonical_name"], "first_seen_chapter": int_value(v["first_seen"]), "reveal_chapter": int_value(v["reveal"]),
                "status": v["status"], "evidence": v["evidence"], "notes": v["notes"],
            }
            self.tables["metadata_entity_history"].append(record)
            grouped[v["id"]].append(record)
        for entity_id, history in grouped.items():
            if len(history) > 1:
                self.issue("warning", "duplicate_entity_id", "entities.md", entity_id, f"Entity ID appears {len(history)} times; history is preserved and the latest row supplies current labels/status.")
            latest = history[-1]
            first_seen_values = [item["first_seen_chapter"] for item in history if item["first_seen_chapter"] is not None]
            reveal_values = [item["reveal_chapter"] for item in history if item["reveal_chapter"] is not None]
            evidence_values = list(dict.fromkeys(item["evidence"] for item in history if item["evidence"]))
            notes_values = list(dict.fromkeys(item["notes"] for item in history if item["notes"]))
            first_seen = min(first_seen_values) if first_seen_values else None
            reveal = min(reveal_values) if reveal_values else first_seen
            self.tables["metadata_entities"].append({
                "novel_id": self.novel_id, "entity_id": entity_id, "entity_type": latest["entity_type"], "canonical_name": latest["canonical_name"],
                "first_seen_chapter": first_seen, "reveal_chapter": reveal, "status": latest["status"], "evidence": "; ".join(evidence_values),
                "notes": "\n\n".join(notes_values),
                # Keep the entity registry spoiler-safe. Cumulative profile prose from characteristics.md
                # lives in metadata_characteristics and is boundary-gated separately.
                "description": latest["notes"],
                "aliases_json": json.dumps(list(dict.fromkeys(aliases_by_entity.get(entity_id, []))), ensure_ascii=False),
                "source_chapter_id": self.source_chapter("; ".join(evidence_values), reveal), "reviewed": self.reviewed(reveal),
            })
        return set(grouped)

    def build_relationships(self):
        rows = table_rows(self.novel_dir / "relationships.md", {"id", "source_id", "relation", "target_id", "reveal_chapter", "evidence"})
        for row in rows:
            v = row.values
            reveal = int_value(v.get("reveal_chapter"))
            self.tables["metadata_relationships"].append({
                "novel_id": self.novel_id, "relationship_id": v["id"], "source_entity_id": v["source_id"], "relation_type": v["relation"], "target_entity_id": v["target_id"],
                "direction": v.get("direction", ""), "valid_from_chapter": int_value(v.get("valid_from")), "valid_to_chapter": int_value(v.get("valid_to")),
                "reveal_chapter": reveal, "cycle_id": v.get("cycle", ""), "status": v.get("status", ""), "certainty": v.get("certainty", ""),
                "evidence": v.get("evidence", ""), "notes": v.get("notes", ""), "source_chapter_id": self.source_chapter(v.get("evidence", ""), reveal), "reviewed": self.reviewed(reveal),
            })

    def build_facts(self):
        rows = table_rows(self.novel_dir / "facts.md", {"id", "subject_id", "predicate", "object_value", "reveal_chapter", "epistemic_status", "evidence"})
        for row in rows:
            v = row.values
            reveal = int_value(v.get("reveal_chapter"))
            self.tables["metadata_facts"].append({
                "novel_id": self.novel_id, "fact_id": v["id"], "subject_id": v["subject_id"], "predicate": v["predicate"], "object_value": v.get("object_value", ""),
                "value_type": v.get("value_type", ""), "reveal_chapter": reveal, "valid_from_chapter": int_value(v.get("valid_from")), "valid_to_chapter": int_value(v.get("valid_to")),
                "cycle_id": v.get("cycle", ""), "epistemic_status": v.get("epistemic_status", "unknown") or "unknown", "source_type": v.get("source_type", ""),
                "source_entity_id": v.get("source_entity", ""), "supersedes": v.get("supersedes", ""), "contradicts": v.get("contradicts", ""),
                "evidence": v.get("evidence", ""), "notes": v.get("notes", ""), "source_chapter_id": self.source_chapter(v.get("evidence", ""), reveal), "reviewed": self.reviewed(reveal),
            })

    def build_events(self):
        rows = table_rows(self.novel_dir / "events.md", {"id", "chapter", "scene_id", "order", "type", "summary", "evidence"})
        for row in rows:
            v = row.values
            chapter = int_value(v["chapter"]) or 0
            self.tables["metadata_events"].append({
                "novel_id": self.novel_id, "event_id": v["id"], "chapter_number": chapter, "scene_id": v.get("scene_id", ""), "scene_order": int_value(v.get("order")),
                "cycle_id": v.get("cycle", ""), "timeline_order": v.get("timeline_order", ""), "event_type": v.get("type", ""), "summary": v.get("summary", ""),
                "location_ids_json": json_list(v.get("locations", "")), "participant_ids_json": json_list(v.get("participants", "")), "cause_event_ids_json": json_list(v.get("cause_event_ids", "")),
                "effect_event_ids_json": json_list(v.get("effect_event_ids", "")), "certainty": v.get("certainty", ""), "evidence": v.get("evidence", ""),
                "source_chapter_id": self.source_chapter(v.get("evidence", ""), chapter), "reviewed": self.reviewed(chapter),
            })

    def build_states(self):
        rows = table_rows(self.novel_dir / "states.md", {"id", "entity_id", "property", "value", "reveal_chapter", "evidence"})
        for row in rows:
            v = row.values
            reveal = int_value(v.get("reveal_chapter"))
            self.tables["metadata_states"].append({
                "novel_id": self.novel_id, "state_id": v["id"], "entity_id": v["entity_id"], "property": v["property"], "value": v.get("value", ""),
                "value_type": v.get("value_type", ""), "valid_from_chapter": int_value(v.get("valid_from")), "valid_to_chapter": int_value(v.get("valid_to")),
                "reveal_chapter": reveal, "cycle_id": v.get("cycle", ""), "certainty": v.get("certainty", ""), "evidence": v.get("evidence", ""), "notes": v.get("notes", ""),
                "source_chapter_id": self.source_chapter(v.get("evidence", ""), reveal), "reviewed": self.reviewed(reveal),
            })

    def build_scenes(self):
        rows = table_rows(self.novel_dir / "scenes.md", {"scene_id", "chapter", "order", "summary", "evidence"})
        for row in rows:
            v = row.values
            chapter = int_value(v["chapter"]) or 0
            self.tables["metadata_scenes"].append({
                "novel_id": self.novel_id, "scene_id": v["scene_id"], "chapter_number": chapter, "scene_order": int_value(v.get("order")), "cycle_id": v.get("cycle", ""),
                "location_ids_json": json_list(v.get("location_ids", "")), "time_marker": v.get("time_marker", ""), "pov_entity_id": v.get("pov_entity", ""),
                "participant_ids_json": json_list(v.get("participant_ids", "")), "event_ids_json": json_list(v.get("event_ids", "")), "summary": v.get("summary", ""),
                "evidence": v.get("evidence", ""), "source_chapter_id": self.source_chapter(v.get("evidence", ""), chapter), "reviewed": self.reviewed(chapter),
            })

    def build_arcs(self):
        rows = table_rows(self.novel_dir / "arcs.md", {"arc_id", "title", "start_chapter", "end_chapter", "reveal_chapter", "evidence"})
        for row in rows:
            v = row.values
            reveal = int_value(v.get("reveal_chapter"))
            self.tables["metadata_arcs"].append({
                "novel_id": self.novel_id, "arc_id": v["arc_id"], "title": v["title"], "parent_arc_id": v.get("parent_arc", ""),
                "start_chapter": int_value(v.get("start_chapter")), "end_chapter": int_value(v.get("end_chapter")), "reveal_chapter": reveal,
                "cycle_ids_json": json_list(v.get("cycle_ids", "")), "status": v.get("status", ""), "summary": v.get("summary", ""),
                "key_entity_ids_json": json_list(v.get("key_entity_ids", "")), "key_event_ids_json": json_list(v.get("key_event_ids", "")), "evidence": v.get("evidence", ""),
                "source_chapter_id": self.source_chapter(v.get("evidence", ""), reveal), "reviewed": self.reviewed(reveal),
            })

    def build_cycles(self):
        rows = table_rows(self.novel_dir / "cycles.md", {"cycle_id", "number", "start_chapter", "end_chapter", "reveal_chapter", "evidence"})
        for row in rows:
            v = row.values
            reveal = int_value(v.get("reveal_chapter"))
            self.tables["metadata_cycles"].append({
                "novel_id": self.novel_id, "cycle_id": v["cycle_id"], "cycle_number": int_value(v.get("number")), "start_chapter": int_value(v.get("start_chapter")),
                "end_chapter": int_value(v.get("end_chapter")), "reveal_chapter": reveal, "world_start_marker": v.get("world_start_marker", ""),
                "world_end_marker": v.get("world_end_marker", ""), "reset_trigger": v.get("reset_trigger", ""), "status": v.get("status", ""),
                "evidence": v.get("evidence", ""), "notes": v.get("notes", ""), "source_chapter_id": self.source_chapter(v.get("evidence", ""), reveal), "reviewed": self.reviewed(reveal),
            })

    def build_glossary_and_memory(self):
        glossary = table_rows(self.novel_dir / "glossarium.md", {"source_term", "canonical_translation", "type", "first_seen", "notes"})
        for source_row, row in enumerate(glossary, start=1):
            v = row.values
            self.tables["metadata_glossary"].append({
                "novel_id": self.novel_id, "source_row": source_row, "source_term": v["source_term"], "canonical_translation": v["canonical_translation"],
                "term_type": v["type"], "first_seen_chapter": int_value(v["first_seen"]), "notes": v["notes"],
            })
            self.legacy["glossariums"].append({
                "novel-id": self.novel_id, "source-term": v["source_term"], "canonical-translation": v["canonical_translation"], "type": v["type"], "first-seen": v["first_seen"], "notes": v["notes"],
            })

        for filename, legacy_table in MEMORY_FILES.items():
            path = self.novel_dir / filename
            source_row = 0
            for row in markdown_table_rows(path):
                # Only use the primary two-/five-column data tables, not prose schema notes with unrelated headers.
                v = row.values
                if filename == "qa-log.md":
                    if not {"tanggal", "chapter", "jenis", "keputusan_masalah", "referensi"}.issubset(v):
                        continue
                    content = " | ".join(v[key] for key in ("tanggal", "chapter", "jenis", "keputusan_masalah", "referensi"))
                    status = v["jenis"]
                    title = v["chapter"]
                else:
                    if "status" not in v:
                        continue
                    body_key = next((key for key in ("deskripsi", "canonical_description", "description") if key in v), None)
                    if not body_key:
                        continue
                    content = v[body_key]
                    status = v["status"]
                    title = first_bold_name(content)
                source_row += 1
                evidence_chapter = None
                targets = wiki_targets(content)
                source_id = self.source_chapter(content, evidence_chapter)
                self.tables["metadata_memory_entries"].append({
                    "novel_id": self.novel_id, "source_file": filename, "source_row": source_row, "status": status, "title": title,
                    "content": content, "source_chapter_id": source_id,
                })
                if legacy_table == "characters":
                    name = title or f"Entry {source_row}"
                    self.legacy[legacy_table].append({"novel-id": self.novel_id, "character-name": name, "character-description": content})
                elif legacy_table == "locations":
                    self.legacy[legacy_table].append({"novel-id": self.novel_id, "location": content})
                elif legacy_table == "continuities":
                    self.legacy[legacy_table].append({"novel-id": self.novel_id, "content": content})
                elif legacy_table == "terminologies":
                    self.legacy[legacy_table].append({"novel-id": self.novel_id, "term": content})
                elif legacy_table == "qa-log":
                    self.legacy[legacy_table].append({"novel-id": self.novel_id, "log": content})

    def build_legacy_content(self):
        self.legacy["novel"].append({"novel_id": self.novel_id, "novel-title": self.title, "lang": self.lang})
        for path in self.chapters:
            content = path.read_text(encoding="utf-8")
            front = parse_frontmatter(content)
            recap = self.recaps.get(path.name)
            try:
                stored_path = path.resolve().relative_to(ROOT).as_posix()
            except ValueError:
                # Explicit series paths outside the checkout are supported for validation/import;
                # keep their stored path deterministic instead of requiring a hard-coded project root.
                stored_path = (Path(self.lang) / self.novel_id / path.relative_to(self.novel_dir)).as_posix()
            self.legacy["novel-content"].append({
                "path": stored_path, "name": path.name, "type": "md", "lang": self.lang, "novel-id": self.novel_id,
                "novel-title": self.title, "content": content, "chapter-id": path.name,
                "chapter-title": front.get("translated_title") or first_heading(content), "recap": recap.read_text(encoding="utf-8") if recap else "",
            })

    def validate_references(self, entity_ids: set[str]):
        relation_ids = {row["relationship_id"] for row in self.tables["metadata_relationships"]}
        event_ids = {row["event_id"] for row in self.tables["metadata_events"]}
        scene_ids = {row["scene_id"] for row in self.tables["metadata_scenes"]}
        cycle_ids = {row["cycle_id"] for row in self.tables["metadata_cycles"]}
        fact_ids = {row["fact_id"] for row in self.tables["metadata_facts"]}
        for row in self.tables["metadata_aliases"]:
            if row["entity_id"] not in entity_ids:
                self.issue("warning", "alias_unknown_entity", "aliases.md", row["alias_id"], row["entity_id"])
        for row in self.tables["metadata_relationships"]:
            for field in ("source_entity_id", "target_entity_id"):
                if row[field] not in entity_ids:
                    self.issue("warning", "relationship_unknown_entity", "relationships.md", row["relationship_id"], f"{field}={row[field]}")
        for row in self.tables["metadata_facts"]:
            if row["subject_id"] and ":" in row["subject_id"] and row["subject_id"] not in entity_ids:
                self.issue("warning", "fact_unknown_subject", "facts.md", row["fact_id"], row["subject_id"])
            for key, known in (("supersedes", fact_ids), ("contradicts", fact_ids)):
                for ref in list_value(row[key]):
                    if ref and ref not in known:
                        self.issue("warning", "fact_unknown_fact_reference", "facts.md", row["fact_id"], f"{key}={ref}")
        for row in self.tables["metadata_states"]:
            if row["entity_id"] not in entity_ids:
                self.issue("warning", "state_unknown_entity", "states.md", row["state_id"], row["entity_id"])
        for row in self.tables["metadata_events"]:
            if row["scene_id"] and row["scene_id"] not in scene_ids:
                self.issue("warning", "event_unknown_scene", "events.md", row["event_id"], row["scene_id"])
            for ref in json.loads(row["participant_ids_json"]):
                if ref and ref not in entity_ids:
                    self.issue("warning", "event_unknown_participant", "events.md", row["event_id"], ref)
            for key in ("cause_event_ids_json", "effect_event_ids_json"):
                for ref in json.loads(row[key]):
                    if ref and ref not in event_ids:
                        self.issue("warning", "event_unknown_event_reference", "events.md", row["event_id"], ref)
        for row in self.tables["metadata_scenes"]:
            if row["pov_entity_id"] and row["pov_entity_id"] not in entity_ids:
                self.issue("warning", "scene_unknown_pov", "scenes.md", row["scene_id"], row["pov_entity_id"])
            for ref in json.loads(row["participant_ids_json"]):
                if ref and ref not in entity_ids:
                    self.issue("warning", "scene_unknown_participant", "scenes.md", row["scene_id"], ref)
            for ref in json.loads(row["event_ids_json"]):
                if ref and ref not in event_ids:
                    self.issue("warning", "scene_unknown_event", "scenes.md", row["scene_id"], ref)
        for row in self.tables["metadata_arcs"]:
            for ref in json.loads(row["key_entity_ids_json"]):
                if ref and ref not in entity_ids:
                    self.issue("warning", "arc_unknown_entity", "arcs.md", row["arc_id"], ref)
            for ref in json.loads(row["key_event_ids_json"]):
                if ref and ref not in event_ids:
                    self.issue("warning", "arc_unknown_event", "arcs.md", row["arc_id"], ref)
            for ref in json.loads(row["cycle_ids_json"]):
                if ref and ref not in cycle_ids:
                    self.issue("warning", "arc_unknown_cycle", "arcs.md", row["arc_id"], ref)
        # Validate evidence links without inventing targets. Global metadata links are allowed.
        known_metadata = {path.stem for path in self.documents}
        for filename in ("aliases.md", "entities.md", "relationships.md", "facts.md", "events.md", "states.md", "scenes.md", "arcs.md", "cycles.md", "characteristics.md"):
            path = self.novel_dir / filename
            if not path.is_file():
                continue
            for target in wiki_targets(path.read_text(encoding="utf-8")):
                stem = Path(target).stem
                if stem not in self.chapter_by_stem and stem not in known_metadata and not (self.novel_dir / target).exists():
                    self.issue("warning", "unresolved_wikilink", filename, target, f"No chapter or root metadata file resolves [[{target}]].")
        # Avoid unused-variable lint confusion and make relationship ID population explicit for future checks.
        _ = relation_ids

    def build(self):
        self.build_chapters()
        self.build_documents()
        aliases = self.build_aliases()
        descriptions = self.build_characteristics()
        entity_ids = self.build_entities(aliases, descriptions)
        self.build_relationships()
        self.build_facts()
        self.build_events()
        self.build_states()
        self.build_scenes()
        self.build_arcs()
        self.build_cycles()
        self.build_glossary_and_memory()
        self.build_legacy_content()
        self.validate_references(entity_ids)
        for index, issue in enumerate(self.issues, start=1):
            self.tables["metadata_integrity_issues"].append(issue.as_row(self.novel_id, index))
        return self

    @property
    def reviewed_through(self) -> int:
        reviewed = [number for number, status in self.chapter_status.items() if status == "reviewed" and number in self.chapter_by_number]
        return max(reviewed, default=0)

    @property
    def actual_chapter_count(self) -> int:
        return len(self.chapters)

    @property
    def metadata_source_hash(self) -> str:
        return source_hash(self.documents + self.chapters + list(self.recaps.values()), self.novel_dir)


class D1Client:
    def __init__(self, account_id: str, database_id: str, token: str):
        self.base = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}"
        self.token = token

    def _request(self, path: str, payload: dict[str, Any] | None = None) -> Any:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(
            self.base + path,
            data=data,
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json", "Accept": "application/json"},
            method="POST" if payload is not None else "GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", "replace")
            raise RuntimeError(f"Cloudflare D1 HTTP {exc.code}: {raw[:1200]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise RuntimeError("Cloudflare D1 request failed or timed out. The write was not retried automatically; inspect migration/sync status before retrying.") from exc
        if body.get("success") is not True or body.get("errors"):
            raise RuntimeError(f"Cloudflare D1 API error: {body.get('errors') or 'unknown error'}")
        return body.get("result")

    def info(self):
        return self._request("")

    def query(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
        result = self._request("/query", {"sql": sql, "params": params or []})
        if not isinstance(result, list):
            raise RuntimeError("Unexpected D1 query response.")
        rows: list[dict[str, Any]] = []
        for item in result:
            if item.get("success") is False or item.get("error"):
                raise RuntimeError(f"D1 SQL failed: {item.get('error')}")
            rows.extend(item.get("results") or [])
        return rows

    def batch(self, statements: list[dict[str, Any]]) -> list[Any]:
        if not statements:
            return []
        result = self._request("/query", {"batch": statements})
        if not isinstance(result, list):
            raise RuntimeError("Unexpected D1 batch response.")
        for item in result:
            if item.get("success") is False or item.get("error"):
                raise RuntimeError(f"D1 batch SQL failed: {item.get('error')}")
        return result


def load_env(path: Path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"\'')
        os.environ.setdefault(key, value)


def sql_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def insert_statement(table: str, row: dict[str, Any], *, replace: bool = False) -> dict[str, Any]:
    columns = list(row)
    quoted = ", ".join(sql_ident(column) for column in columns)
    placeholders = ", ".join("?" for _ in columns)
    verb = "INSERT OR REPLACE" if replace else "INSERT"
    return {"sql": f"{verb} INTO {sql_ident(table)} ({quoted}) VALUES ({placeholders})", "params": [row[column] for column in columns]}


def chunks(items: list[Any], size: int):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def require_tables(client: D1Client):
    required = set(CANONICAL_TABLES + ["metadata_sync_runs", "metadata_novel_content_stage", "novel", "novel-content", "characters", "glossariums", "locations", "terminologies", "continuities", "qa-log"])
    rows = client.query("SELECT name FROM sqlite_master WHERE type='table'")
    actual = {row.get("name") for row in rows}
    missing = sorted(required - actual)
    if missing:
        raise RuntimeError(f"Database schema is missing {', '.join(missing)}. Run `npm run db:migrate:remote` first.")


def write_versioned_snapshot(client: D1Client, table: str, rows: list[dict[str, Any]], snapshot_id: str):
    statements = []
    for row in rows:
        enriched = dict(row)
        # Keep column order readable in API logs; SQL itself does not depend on it.
        novel_id = enriched.pop("novel_id")
        enriched = {"novel_id": novel_id, "snapshot_id": snapshot_id, **enriched}
        statements.append(insert_statement(table, enriched, replace=True))
    for group in chunks(statements, 100):
        client.batch(group)

def replace_legacy_snapshot(client: D1Client, table: str, novel_id: str, rows: list[dict[str, Any]]):
    column = "novel_id" if table == "novel" else "novel-id"
    statements = [{"sql": f"DELETE FROM {sql_ident(table)} WHERE {sql_ident(column)} = ?", "params": [novel_id]}]
    statements.extend(insert_statement(table, row) for row in rows)
    client.batch(statements[:100])
    for group in chunks(statements[100:], 100):
        client.batch(group)


def replace_novel_content(client: D1Client, novel_id: str, rows: list[dict[str, Any]], sync_token: str):
    client.query("DELETE FROM metadata_novel_content_stage WHERE sync_token = ? AND novel_id = ?", [sync_token, novel_id])
    staged: list[dict[str, Any]] = []
    for row in rows:
        staged.append({
            "sync_token": sync_token, "novel_id": novel_id, "path": row["path"], "name": row["name"], "type": row["type"], "lang": row["lang"],
            "novel_title": row["novel-title"], "content": row["content"], "chapter_id": row["chapter-id"], "chapter_title": row["chapter-title"], "recap": row["recap"],
        })
    # Large chapter bodies are uploaded to staging in bounded batches. Reader data is untouched until every row is staged.
    for group in chunks([insert_statement("metadata_novel_content_stage", row) for row in staged], 10):
        client.batch(group)
    client.batch([
        {"sql": 'DELETE FROM "novel-content" WHERE "novel-id" = ?', "params": [novel_id]},
        {"sql": 'INSERT INTO "novel-content" ("path","name","type","lang","novel-id","novel-title","content","chapter-id","chapter-title","recap") SELECT path,name,type,lang,novel_id,novel_title,content,chapter_id,chapter_title,recap FROM metadata_novel_content_stage WHERE sync_token = ? AND novel_id = ? ORDER BY chapter_id', "params": [sync_token, novel_id]},
        {"sql": 'DELETE FROM metadata_novel_content_stage WHERE sync_token = ? AND novel_id = ?', "params": [sync_token, novel_id]},
    ])


def apply_snapshot(client: D1Client, snapshot: SnapshotBuilder):
    require_tables(client)
    sync_token = snapshot.metadata_source_hash[:24]
    # Canonical structured metadata first. If later reader-table sync fails, the next run is idempotent and replaces it again.
    for table in CANONICAL_TABLES:
        write_versioned_snapshot(client, table, snapshot.tables[table], snapshot.metadata_source_hash)
        print(f"SYNC {table}: {len(snapshot.tables[table])} rows", flush=True)

    replace_legacy_snapshot(client, "novel", snapshot.novel_id, snapshot.legacy["novel"])
    replace_novel_content(client, snapshot.novel_id, snapshot.legacy["novel-content"], sync_token)
    for table in ("characters", "glossariums", "locations", "terminologies", "continuities", "qa-log"):
        replace_legacy_snapshot(client, table, snapshot.novel_id, snapshot.legacy[table])
        print(f"SYNC {table}: {len(snapshot.legacy[table])} rows", flush=True)

    coverage_note = (
        f"Markdown metadata v2 snapshot. {snapshot.actual_chapter_count} chapter files available; "
        f"metadata reviewed through chapter {snapshot.reviewed_through}. Integrity issues are stored in metadata_integrity_issues."
    )
    client.query(
        """INSERT INTO metadata_sync_runs
          (novel_id, source_hash, source_file_count, chapter_count, reviewed_through, issue_count, status, coverage_note)
          VALUES (?, ?, ?, ?, ?, ?, 'complete', ?)
          ON CONFLICT(novel_id, source_hash) DO UPDATE SET
            source_file_count = excluded.source_file_count,
            chapter_count = excluded.chapter_count,
            reviewed_through = excluded.reviewed_through,
            issue_count = excluded.issue_count,
            status = 'complete',
            coverage_note = excluded.coverage_note,
            applied_at = CURRENT_TIMESTAMP""",
        [snapshot.novel_id, snapshot.metadata_source_hash, len(snapshot.documents), snapshot.actual_chapter_count, snapshot.reviewed_through, len(snapshot.issues), coverage_note],
    )


def snapshot_summary(snapshot: SnapshotBuilder) -> dict[str, Any]:
    severity = Counter(issue.severity for issue in snapshot.issues)
    return {
        "novel_id": snapshot.novel_id,
        "title": snapshot.title,
        "metadata_markdown_files": len(snapshot.documents),
        "actual_chapters": snapshot.actual_chapter_count,
        "actual_recaps": len(snapshot.recaps),
        "reviewed_through": snapshot.reviewed_through,
        "source_hash": snapshot.metadata_source_hash,
        "canonical_rows": {table: len(snapshot.tables[table]) for table in CANONICAL_TABLES},
        "legacy_rows": {table: len(rows) for table, rows in snapshot.legacy.items()},
        "issues": dict(severity),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate and synchronize Markdown series under id/ into Cloudflare D1."
    )
    parser.add_argument(
        "series_dirs",
        nargs="*",
        help=(
            "Optional series directories. When omitted, every direct child of id/ containing "
            "NOVEL.md, chapter-index.md, and chapters/ is discovered and processed."
        ),
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--validate", action="store_true", help="Parse selected/all series and report integrity findings without connecting to D1.")
    mode.add_argument("--dry-run", action="store_true", help="Alias of --validate with row counts intended for migration preview.")
    mode.add_argument("--apply", action="store_true", help="Synchronize selected/all series to remote D1 after every series validates.")
    parser.add_argument("--issues", action="store_true", help="Print individual validation issues.")
    args = parser.parse_args(argv)

    try:
        series_dirs = resolve_series_dirs(args.series_dirs, ROOT)
    except ValueError as error:
        parser.error(str(error))

    print(f"Discovered {len(series_dirs)} series: {', '.join(path.name for path in series_dirs)}")
    snapshots: list[SnapshotBuilder] = []
    validation_errors = 0
    for novel_dir in series_dirs:
        snapshot = SnapshotBuilder(novel_dir).build()
        snapshots.append(snapshot)
        print(f"\n=== {snapshot.novel_id} ===")
        print(json.dumps(snapshot_summary(snapshot), ensure_ascii=False, indent=2))
        if args.issues:
            for issue in snapshot.issues:
                print(
                    f"{snapshot.novel_id} {issue.severity.upper():7} {issue.code:30} "
                    f"{issue.source_file}:{issue.record_id} - {issue.detail}"
                )
        validation_errors += sum(issue.severity == "error" for issue in snapshot.issues)

    if validation_errors:
        print(
            f"Validation failed with {validation_errors} error(s) across {len(snapshots)} series; "
            "no D1 writes were attempted.",
            file=sys.stderr,
        )
        return 2

    total_chapters = sum(snapshot.actual_chapter_count for snapshot in snapshots)
    total_rows = sum(sum(len(rows) for rows in snapshot.tables.values()) for snapshot in snapshots)
    total_issues = sum(len(snapshot.issues) for snapshot in snapshots)
    if not args.apply:
        print(
            f"Validation complete for {len(snapshots)} series: {total_chapters} chapters, "
            f"{total_rows} canonical metadata rows, {total_issues} integrity issue(s). "
            "No D1 writes were attempted."
        )
        return 0

    load_env(ROOT / ".env")
    load_env(ROOT / "scripts" / "sqilte-migration" / ".env")
    account_id = (os.getenv("CLOUDFLARE_ID") or os.getenv("CLOUDFLARE_ACCOUNT_ID") or "").strip()
    database_id = (os.getenv("DATABASE_ID") or "").strip()
    database_name = (os.getenv("DATABASE_NAME") or "").strip()
    token = (os.getenv("CLOUDFLARE_API_TOKEN") or "").strip()
    missing = [name for name, value in (("CLOUDFLARE_ID", account_id), ("DATABASE_ID", database_id), ("DATABASE_NAME", database_name), ("CLOUDFLARE_API_TOKEN", token)) if not value]
    if missing:
        raise SystemExit(f"Missing required environment variable(s): {', '.join(missing)}")
    client = D1Client(account_id, database_id, token)
    info = client.info()
    if str(info.get("uuid", "")).lower() != database_id.lower() or info.get("name") != database_name:
        raise SystemExit(f"Database mismatch: expected {database_name} ({database_id}), got {info.get('name')} ({info.get('uuid')}).")
    print(f"REMOTE D1: {info.get('name')} ({info.get('uuid')})")

    completed: list[str] = []
    for snapshot in snapshots:
        print(f"\nSYNC SERIES {snapshot.novel_id} ...", flush=True)
        try:
            apply_snapshot(client, snapshot)
        except Exception as error:
            done = ", ".join(completed) if completed else "none"
            raise RuntimeError(
                f"Series sync stopped at {snapshot.novel_id}. Already completed: {done}. "
                f"The sync is idempotent; fix the error and rerun. {error}"
            ) from error
        completed.append(snapshot.novel_id)
        print(
            f"SYNCED {snapshot.novel_id}: {snapshot.actual_chapter_count} chapters, "
            f"{sum(len(v) for v in snapshot.tables.values())} canonical metadata rows, "
            f"{len(snapshot.issues)} integrity issue(s)."
        )

    print(
        f"Sync complete for {len(completed)} series: {total_chapters} chapters, "
        f"{total_rows} canonical metadata rows, {total_issues} integrity issue(s) recorded."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
