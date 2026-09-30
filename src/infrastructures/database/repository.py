from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import asdict, replace
from pathlib import Path
from typing import Any, Iterable

from src.applications.ports.repositories import StoryRepository
from src.domains.models import (
    ArcSnapshot,
    EntitySnapshot,
    GlossarySnapshot,
    PreviousChapter,
    RelationshipSnapshot,
    StyleProfile,
    TerminologySnapshot,
    TranslationResult,
)
from src.infrastructures.database.db import connect

logger = logging.getLogger(__name__)
TRACE = 5


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_load(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def _nonempty(value: str, fallback: str) -> str:
    return value if value.strip() else fallback


def _merge_dict(old: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
    merged = dict(old)
    for key, value in new.items():
        if value not in (None, "", [], {}):
            merged[key] = value
    return merged


def _merge_tuple(old: tuple[str, ...], new: tuple[str, ...]) -> tuple[str, ...]:
    out: list[str] = []
    for item in (*old, *new):
        if item and item not in out:
            out.append(item)
    return tuple(out)


class SQLiteStoryRepository(StoryRepository):
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        logger.debug("Opening SQLite repository path=%s", self.db_path)
        self.conn = connect(self.db_path)
        logger.log(TRACE, "SQLite connection opened path=%s", self.db_path)

    def close(self) -> None:
        logger.log(TRACE, "Closing SQLite connection path=%s", self.db_path)
        self.conn.close()

    def initialize(self) -> None:
        logger.debug("Initializing SQLite schema path=%s", self.db_path)
        # Refuse to silently reuse the older 17-ledger schema. It has tables with
        # the same names but incompatible columns and should remain untouched.
        existing = {row[0] for row in self.conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "entities" in existing:
            columns = {row[1] for row in self.conn.execute("PRAGMA table_info(entities)")}
            required = {"novel_id", "lang_id", "chapter_number", "entity_id"}
            if not required.issubset(columns):
                raise RuntimeError(
                    "Legacy/incompatible SQLite schema detected. Point DATABASE_PATH to a new database "
                    "(recommended: storage/story.sqlite3) instead of overwriting the old metadata database."
                )
        schema_path = Path(__file__).with_name("schema.sql")
        self.conn.executescript(schema_path.read_text(encoding="utf-8"))
        self.conn.execute("PRAGMA user_version=2")
        self.conn.commit()
        logger.debug("SQLite schema ready path=%s user_version=2 tables=%s", self.db_path, sorted(existing | {"chapters", "entities", "relationships", "terminology", "glossary", "arcs", "style_profiles", "translation_runs", "translation_jobs", "translation_job_events", "translation_settings"}))

    def is_chapter_current(
        self,
        novel_id: str,
        lang_id: str,
        chapter_number: int,
        source_hash: str,
        prompt_version: str,
        model: str,
    ) -> bool:
        row = self.conn.execute(
            """SELECT 1 FROM chapters
               WHERE novel_id=? AND lang_id=? AND chapter_number=?
                 AND source_hash=? AND prompt_version=? AND model=?
                 AND status='completed' AND stale=0""",
            (novel_id, lang_id, chapter_number, source_hash, prompt_version, model),
        ).fetchone()
        current = row is not None
        logger.log(TRACE, "Cache current check novel=%s lang=%s chapter=%d current=%s", novel_id, lang_id, chapter_number, current)
        return current

    def has_completed_chapter(self, novel_id: str, lang_id: str, chapter_number: int) -> bool:
        row = self.conn.execute(
            """SELECT 1 FROM chapters
               WHERE novel_id=? AND lang_id=? AND chapter_number=?
                 AND status='completed' AND stale=0""",
            (novel_id, lang_id, chapter_number),
        ).fetchone()
        completed = row is not None
        logger.log(TRACE, "Completed chapter check novel=%s lang=%s chapter=%d completed=%s", novel_id, lang_id, chapter_number, completed)
        return completed

    def previous_chapters(
        self,
        novel_id: str,
        lang_id: str,
        before_chapter: int,
        limit: int,
    ) -> list[PreviousChapter]:
        if limit <= 0:
            return []
        logger.log(TRACE, "Query previous chapters novel=%s lang=%s before=%d limit=%d", novel_id, lang_id, before_chapter, limit)
        rows = self.conn.execute(
            """SELECT chapter_number, chapter_title, translated_text, continuity_summary
               FROM chapters
               WHERE novel_id=? AND lang_id=? AND chapter_number<?
                 AND status='completed' AND stale=0
               ORDER BY chapter_number DESC LIMIT ?""",
            (novel_id, lang_id, before_chapter, limit),
        ).fetchall()
        logger.debug("Previous chapter query returned count=%d ids=%s", len(rows), [int(row["chapter_number"]) for row in reversed(rows)])
        return [
            PreviousChapter(
                chapter_number=int(row["chapter_number"]),
                title=row["chapter_title"] or "",
                translation=row["translated_text"] or "",
                summary=row["continuity_summary"] or "",
            )
            for row in reversed(rows)
        ]

    def latest_style(self, novel_id: str, lang_id: str, before_chapter: int) -> StyleProfile | None:
        logger.log(TRACE, "Query latest style novel=%s lang=%s before=%d", novel_id, lang_id, before_chapter)
        row = self.conn.execute(
            """SELECT s.* FROM style_profiles s
               JOIN chapters c ON c.novel_id=s.novel_id AND c.lang_id=s.lang_id
                              AND c.chapter_number=s.chapter_number AND c.stale=0
               WHERE s.novel_id=? AND s.lang_id=? AND s.chapter_number<?
               ORDER BY s.chapter_number DESC LIMIT 1""",
            (novel_id, lang_id, before_chapter),
        ).fetchone()
        logger.debug("Latest style found=%s chapter=%s", bool(row), row["chapter_number"] if row else None)
        return self._style_from_row(row) if row else None

    def relevant_entities(
        self,
        novel_id: str,
        lang_id: str,
        before_chapter: int,
        source_text: str,
        *,
        recent_from_chapter: int,
        limit: int,
    ) -> list[EntitySnapshot]:
        rows = self._latest_rows("entities", "entity_id", novel_id, lang_id, before_chapter)
        text = source_text.casefold()
        scored: list[tuple[int, sqlite3.Row]] = []
        for row in rows:
            refs = [row["source_name"], row["canonical_name"], *_json_load(row["aliases_json"], [])]
            matches = sum(1 for ref in refs if isinstance(ref, str) and len(ref.strip()) >= 2 and ref.casefold() in text)
            recent = int(row["chapter_number"]) >= recent_from_chapter
            if matches or recent:
                scored.append((matches * 100 + (20 if recent else 0) + int(row["chapter_number"]), row))
        scored.sort(key=lambda item: item[0], reverse=True)
        selected_rows = scored[:limit]
        logger.debug("Entity retrieval candidates=%d matched_or_recent=%d selected=%d limit=%d", len(rows), len(scored), len(selected_rows), limit)
        logger.log(TRACE, "Entity retrieval scores=%s", [(score, row["entity_id"]) for score, row in selected_rows])
        return [self._entity_from_row(row) for _, row in selected_rows]

    def relevant_relationships(
        self,
        novel_id: str,
        lang_id: str,
        before_chapter: int,
        entity_ids: list[str],
        *,
        recent_from_chapter: int,
        limit: int,
    ) -> list[RelationshipSnapshot]:
        rows = self._latest_rows("relationships", "relationship_id", novel_id, lang_id, before_chapter)
        selected = set(entity_ids)
        scored: list[tuple[int, sqlite3.Row]] = []
        for row in rows:
            touches = row["source_entity_id"] in selected or row["target_entity_id"] in selected
            recent = int(row["chapter_number"]) >= recent_from_chapter
            if touches or recent:
                scored.append(((100 if touches else 0) + (20 if recent else 0) + int(row["chapter_number"]), row))
        scored.sort(key=lambda item: item[0], reverse=True)
        selected_rows = scored[:limit]
        logger.debug("Relationship retrieval candidates=%d matched_or_recent=%d selected=%d limit=%d entity_scope=%d", len(rows), len(scored), len(selected_rows), limit, len(selected))
        logger.log(TRACE, "Relationship retrieval scores=%s", [(score, row["relationship_id"]) for score, row in selected_rows])
        return [self._relationship_from_row(row) for _, row in selected_rows]

    def relevant_terminology(
        self,
        novel_id: str,
        lang_id: str,
        before_chapter: int,
        source_text: str,
        *,
        recent_from_chapter: int,
        limit: int,
    ) -> list[TerminologySnapshot]:
        rows = self._latest_rows("terminology", "term_id", novel_id, lang_id, before_chapter)
        text = source_text.casefold()
        scored: list[tuple[int, sqlite3.Row]] = []
        for row in rows:
            source_match = len(row["source_term"].strip()) >= 2 and row["source_term"].casefold() in text
            canonical_match = len(row["canonical_term"].strip()) >= 2 and row["canonical_term"].casefold() in text
            recent = int(row["chapter_number"]) >= recent_from_chapter
            if source_match or canonical_match or recent:
                scored.append(((120 if source_match else 80 if canonical_match else 0) + (20 if recent else 0), row))
        scored.sort(key=lambda item: item[0], reverse=True)
        selected_rows = scored[:limit]
        logger.debug("Terminology retrieval candidates=%d matched_or_recent=%d selected=%d limit=%d", len(rows), len(scored), len(selected_rows), limit)
        logger.log(TRACE, "Terminology retrieval scores=%s", [(score, row["term_id"]) for score, row in selected_rows])
        return [self._term_from_row(row) for _, row in selected_rows]

    def relevant_glossary(
        self,
        novel_id: str,
        lang_id: str,
        before_chapter: int,
        source_text: str,
        *,
        recent_from_chapter: int,
        limit: int,
    ) -> list[GlossarySnapshot]:
        rows = self._latest_rows("glossary", "glossary_id", novel_id, lang_id, before_chapter)
        text = source_text.casefold()
        scored: list[tuple[int, sqlite3.Row]] = []
        for row in rows:
            aliases = _json_load(row["aliases_json"], [])
            refs = [row["term"], *aliases]
            match = any(isinstance(ref, str) and len(ref.strip()) >= 2 and ref.casefold() in text for ref in refs)
            recent = int(row["chapter_number"]) >= recent_from_chapter
            if match or recent:
                scored.append(((100 if match else 0) + (20 if recent else 0), row))
        scored.sort(key=lambda item: item[0], reverse=True)
        selected_rows = scored[:limit]
        logger.debug("Glossary retrieval candidates=%d matched_or_recent=%d selected=%d limit=%d", len(rows), len(scored), len(selected_rows), limit)
        logger.log(TRACE, "Glossary retrieval scores=%s", [(score, row["glossary_id"]) for score, row in selected_rows])
        return [self._glossary_from_row(row) for _, row in selected_rows]

    def active_arcs(
        self,
        novel_id: str,
        lang_id: str,
        before_chapter: int,
        limit: int,
    ) -> list[ArcSnapshot]:
        rows = self._latest_rows("arcs", "arc_id", novel_id, lang_id, before_chapter)
        rows = [row for row in rows if (row["status"] or "").lower() != "closed"]
        rows.sort(key=lambda row: int(row["chapter_number"]), reverse=True)
        selected = rows[:limit]
        logger.debug("Arc retrieval active_candidates=%d selected=%d limit=%d", len(rows), len(selected), limit)
        logger.log(TRACE, "Arc retrieval ids=%s", [row["arc_id"] for row in selected])
        return [self._arc_from_row(row) for row in selected]

    def save_translation(self, result: TranslationResult, lang_id: str) -> None:
        chapter = result.raw_chapter
        n = chapter.chapter_number
        novel_id = chapter.novel_id
        metadata = result.metadata
        logger.info(
            "SQLite save begin novel=%s lang=%s chapter=%d translation_chars=%d entities=%d relationships=%d terminology=%d glossary=%d arcs=%d style=%s",
            novel_id, lang_id, n, len(result.translated_text), len(metadata.entities), len(metadata.relationships),
            len(metadata.terminology), len(metadata.glossary), len(metadata.arcs), self._style_has_content(metadata.style),
        )

        with self.conn:
            # Any upstream rewrite invalidates all dependent future contexts.
            stale_cursor = self.conn.execute(
                "UPDATE chapters SET stale=1, updated_at=CURRENT_TIMESTAMP WHERE novel_id=? AND lang_id=? AND chapter_number>?",
                (novel_id, lang_id, n),
            )
            logger.debug("Marked downstream stale rows=%d after chapter=%d", stale_cursor.rowcount, n)

            for table in ("entities", "relationships", "terminology", "glossary", "arcs", "style_profiles"):
                cursor = self.conn.execute(
                    f"DELETE FROM {table} WHERE novel_id=? AND lang_id=? AND chapter_number=?",
                    (novel_id, lang_id, n),
                )
                logger.log(TRACE, "Cleared prior chapter snapshot table=%s rows=%d", table, cursor.rowcount)

            self.conn.execute(
                """INSERT INTO chapters(
                       novel_id,lang_id,chapter_number,source_path,source_hash,chapter_title,
                       translated_text,continuity_summary,context_fingerprint,model,prompt_version,status,stale
                   ) VALUES(?,?,?,?,?,?,?,?,?,?,?,'completed',0)
                   ON CONFLICT(novel_id,lang_id,chapter_number) DO UPDATE SET
                     source_path=excluded.source_path, source_hash=excluded.source_hash,
                     chapter_title=excluded.chapter_title, translated_text=excluded.translated_text,
                     continuity_summary=excluded.continuity_summary,
                     context_fingerprint=excluded.context_fingerprint, model=excluded.model,
                     prompt_version=excluded.prompt_version, status='completed', stale=0,
                     updated_at=CURRENT_TIMESTAMP""",
                (
                    novel_id, lang_id, n, str(chapter.path), chapter.source_hash,
                    metadata.chapter_title or chapter.title, result.translated_text,
                    metadata.summary, result.context_fingerprint, result.model, result.prompt_version,
                ),
            )

            for entity in metadata.entities:
                entity = self._merge_entity_with_prior(novel_id, lang_id, n, entity)
                self.conn.execute(
                    """INSERT INTO entities VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        novel_id, lang_id, entity.entity_id, n, entity.entity_type, entity.source_name,
                        entity.canonical_name, _json_dump(entity.aliases), entity.description,
                        _json_dump(entity.biography), _json_dump(entity.appearance),
                        _json_dump(entity.behavior), _json_dump(entity.characteristics), entity.first_seen_chapter,
                    ),
                )

            for relationship in metadata.relationships:
                relationship = self._merge_relationship_with_prior(novel_id, lang_id, n, relationship)
                self.conn.execute(
                    "INSERT INTO relationships VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (
                        novel_id, lang_id, relationship.relationship_id, n,
                        relationship.source_entity_id, relationship.target_entity_id,
                        relationship.name, relationship.description, relationship.direction, relationship.status,
                    ),
                )

            for term in metadata.terminology:
                term = self._merge_term_with_prior(novel_id, lang_id, n, term)
                self.conn.execute(
                    "INSERT INTO terminology VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (
                        novel_id, lang_id, term.term_id, n, term.source_term, term.canonical_term,
                        term.category, term.translation_rule, term.description, term.notes,
                    ),
                )

            for item in metadata.glossary:
                item = self._merge_glossary_with_prior(novel_id, lang_id, n, item)
                self.conn.execute(
                    "INSERT INTO glossary VALUES(?,?,?,?,?,?,?,?,?)",
                    (
                        novel_id, lang_id, item.glossary_id, n, item.term, item.definition,
                        item.category, _json_dump(item.aliases), item.notes,
                    ),
                )

            for arc in metadata.arcs:
                arc = self._merge_arc_with_prior(novel_id, lang_id, n, arc)
                self.conn.execute(
                    "INSERT INTO arcs VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (
                        novel_id, lang_id, arc.arc_id, n, arc.name, arc.status, arc.summary,
                        arc.chapter_role, arc.start_chapter, arc.end_chapter,
                    ),
                )

            if self._style_has_content(metadata.style):
                style = self._merge_style_with_prior(novel_id, lang_id, n, metadata.style)
                self.conn.execute(
                    "INSERT INTO style_profiles VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        novel_id, lang_id, n, style.narration_pov, style.tense, style.register,
                        style.dialogue_style, style.honorific_policy, style.punctuation, style.prose_rhythm,
                        _json_dump(style.character_voice_rules), _json_dump(style.do_not_change),
                        style.notes,
                    ),
                )
            logger.info("SQLite save committed novel=%s lang=%s chapter=%d", novel_id, lang_id, n)

    def start_run(self, run_id: str, novel_id: str, lang_id: str, start: int, end: int) -> None:
        logger.debug("Recording translation run id=%s novel=%s lang=%s range=%d..%d", run_id, novel_id, lang_id, start, end)
        with self.conn:
            self.conn.execute(
                """INSERT INTO translation_runs(novel_id,lang_id,run_id,start_chapter,end_chapter,status)
                   VALUES(?,?,?,?,?,'running')""",
                (novel_id, lang_id, run_id, start, end),
            )

    def finish_run(self, run_id: str, status: str, message: str = "") -> None:
        logger.debug("Finishing translation run id=%s status=%s message=%r", run_id, status, message[:240])
        with self.conn:
            self.conn.execute(
                """UPDATE translation_runs SET status=?, message=?, finished_at=CURRENT_TIMESTAMP
                   WHERE run_id=?""",
                (status, message, run_id),
            )

    def chapter_count(self, novel_id: str, lang_id: str) -> int:
        return int(self.conn.execute(
            "SELECT COUNT(*) FROM chapters WHERE novel_id=? AND lang_id=? AND status='completed' AND stale=0",
            (novel_id, lang_id),
        ).fetchone()[0])

    def metadata_counts(self, novel_id: str, lang_id: str) -> dict[str, int]:
        counts: dict[str, int] = {}
        for table in ("entities", "relationships", "terminology", "glossary", "arcs", "style_profiles"):
            row = self.conn.execute(
                f"""SELECT COUNT(*) FROM {table} m
                     JOIN chapters c ON c.novel_id=m.novel_id AND c.lang_id=m.lang_id
                                    AND c.chapter_number=m.chapter_number AND c.stale=0
                     WHERE m.novel_id=? AND m.lang_id=?""",
                (novel_id, lang_id),
            ).fetchone()
            counts[table] = int(row[0])
        return counts

    # ---- Read-only preview queries -------------------------------------------------

    def preview_overview(self) -> dict[str, Any]:
        rows = self.conn.execute(
            """SELECT novel_id, lang_id,
                      COUNT(*) AS total_rows,
                      SUM(CASE WHEN status='completed' AND stale=0 THEN 1 ELSE 0 END) AS completed,
                      SUM(CASE WHEN stale=1 THEN 1 ELSE 0 END) AS stale,
                      MAX(chapter_number) AS latest_chapter,
                      MAX(updated_at) AS updated_at
               FROM chapters
               GROUP BY novel_id, lang_id
               ORDER BY MAX(updated_at) DESC, novel_id, lang_id"""
        ).fetchall()
        novels = [dict(row) for row in rows]
        run_rows = self.conn.execute(
            """SELECT novel_id,lang_id,run_id,start_chapter,end_chapter,status,message,started_at,finished_at
               FROM translation_runs ORDER BY started_at DESC LIMIT 12"""
        ).fetchall()
        logger.log(TRACE, "Preview overview novels=%d recent_runs=%d", len(novels), len(run_rows))
        return {
            "database": str(self.db_path),
            "novels": novels,
            "recent_runs": [dict(row) for row in run_rows],
        }

    def preview_novel(self, novel_id: str, lang_id: str) -> dict[str, Any]:
        rows = self.conn.execute(
            """SELECT chapter_number,chapter_title,continuity_summary,status,stale,model,prompt_version,
                      translated_at,updated_at,LENGTH(translated_text) AS translated_chars
               FROM chapters
               WHERE novel_id=? AND lang_id=?
               ORDER BY chapter_number""",
            (novel_id, lang_id),
        ).fetchall()
        counts = self.metadata_counts(novel_id, lang_id)
        logger.log(TRACE, "Preview novel novel=%s lang=%s chapters=%d", novel_id, lang_id, len(rows))
        return {
            "novel_id": novel_id,
            "lang_id": lang_id,
            "chapters": [dict(row) for row in rows],
            "metadata_counts": counts,
            "completed_chapters": sum(1 for row in rows if row["status"] == "completed" and not row["stale"]),
            "stale_chapters": sum(1 for row in rows if row["stale"]),
        }

    def preview_chapter(self, novel_id: str, lang_id: str, chapter_number: int) -> dict[str, Any] | None:
        row = self.conn.execute(
            """SELECT * FROM chapters WHERE novel_id=? AND lang_id=? AND chapter_number=?""",
            (novel_id, lang_id, chapter_number),
        ).fetchone()
        if not row:
            return None
        previous_row = self.conn.execute(
            """SELECT MAX(chapter_number) AS n FROM chapters
               WHERE novel_id=? AND lang_id=? AND chapter_number<? AND status='completed' AND stale=0""",
            (novel_id, lang_id, chapter_number),
        ).fetchone()
        next_row = self.conn.execute(
            """SELECT MIN(chapter_number) AS n FROM chapters
               WHERE novel_id=? AND lang_id=? AND chapter_number>? AND status='completed' AND stale=0""",
            (novel_id, lang_id, chapter_number),
        ).fetchone()
        metadata = {
            "entities": [dict(x) for x in self.conn.execute(
                "SELECT * FROM entities WHERE novel_id=? AND lang_id=? AND chapter_number=? ORDER BY canonical_name",
                (novel_id, lang_id, chapter_number),
            ).fetchall()],
            "relationships": [dict(x) for x in self.conn.execute(
                "SELECT * FROM relationships WHERE novel_id=? AND lang_id=? AND chapter_number=? ORDER BY name",
                (novel_id, lang_id, chapter_number),
            ).fetchall()],
            "terminology": [dict(x) for x in self.conn.execute(
                "SELECT * FROM terminology WHERE novel_id=? AND lang_id=? AND chapter_number=? ORDER BY canonical_term",
                (novel_id, lang_id, chapter_number),
            ).fetchall()],
            "glossary": [dict(x) for x in self.conn.execute(
                "SELECT * FROM glossary WHERE novel_id=? AND lang_id=? AND chapter_number=? ORDER BY term",
                (novel_id, lang_id, chapter_number),
            ).fetchall()],
            "arcs": [dict(x) for x in self.conn.execute(
                "SELECT * FROM arcs WHERE novel_id=? AND lang_id=? AND chapter_number=? ORDER BY name",
                (novel_id, lang_id, chapter_number),
            ).fetchall()],
        }
        data = dict(row)
        data["previous_chapter"] = previous_row["n"] if previous_row else None
        data["next_chapter"] = next_row["n"] if next_row else None
        data["metadata"] = metadata
        return data

    def preview_entities(self, novel_id: str, lang_id: str) -> list[dict[str, Any]]:
        rows = self._latest_rows("entities", "entity_id", novel_id, lang_id, 2_147_483_647)
        out: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item["aliases"] = _json_load(item.pop("aliases_json", "[]"), [])
            item["biography"] = _json_load(item.pop("biography_json", "{}"), {})
            item["appearance"] = _json_load(item.pop("appearance_json", "{}"), {})
            item["behavior"] = _json_load(item.pop("behavior_json", "{}"), {})
            item["characteristics"] = _json_load(item.pop("characteristics_json", "{}"), {})
            out.append(item)
        out.sort(key=lambda item: (item.get("entity_type", ""), item.get("canonical_name", "").casefold()))
        return out

    def preview_relationships(self, novel_id: str, lang_id: str) -> list[dict[str, Any]]:
        rows = self._latest_rows("relationships", "relationship_id", novel_id, lang_id, 2_147_483_647)
        return sorted((dict(row) for row in rows), key=lambda item: (item.get("name", ""), item.get("relationship_id", "")))

    def preview_terminology(self, novel_id: str, lang_id: str) -> list[dict[str, Any]]:
        rows = self._latest_rows("terminology", "term_id", novel_id, lang_id, 2_147_483_647)
        return sorted((dict(row) for row in rows), key=lambda item: item.get("canonical_term", "").casefold())

    def preview_glossary(self, novel_id: str, lang_id: str) -> list[dict[str, Any]]:
        rows = self._latest_rows("glossary", "glossary_id", novel_id, lang_id, 2_147_483_647)
        out: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item["aliases"] = _json_load(item.pop("aliases_json", "[]"), [])
            out.append(item)
        return sorted(out, key=lambda item: item.get("term", "").casefold())

    def preview_arcs(self, novel_id: str, lang_id: str) -> list[dict[str, Any]]:
        rows = self._latest_rows("arcs", "arc_id", novel_id, lang_id, 2_147_483_647)
        return sorted((dict(row) for row in rows), key=lambda item: (item.get("start_chapter") or 0, item.get("name", "")))

    def preview_runs(self, novel_id: str, lang_id: str, limit: int = 30) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """SELECT run_id,start_chapter,end_chapter,status,message,started_at,finished_at
               FROM translation_runs WHERE novel_id=? AND lang_id=?
               ORDER BY started_at DESC LIMIT ?""",
            (novel_id, lang_id, max(1, min(limit, 200))),
        ).fetchall()
        return [dict(row) for row in rows]

    def _latest_rows(
        self,
        table: str,
        id_column: str,
        novel_id: str,
        lang_id: str,
        before_chapter: int,
    ) -> list[sqlite3.Row]:
        # Only snapshots belonging to non-stale completed chapters are eligible context.
        sql = f"""
            WITH eligible AS (
                SELECT m.*
                FROM {table} m
                JOIN chapters c ON c.novel_id=m.novel_id AND c.lang_id=m.lang_id
                               AND c.chapter_number=m.chapter_number
                               AND c.status='completed' AND c.stale=0
                WHERE m.novel_id=? AND m.lang_id=? AND m.chapter_number<?
            ), latest AS (
                SELECT {id_column} AS item_id, MAX(chapter_number) AS chapter_number
                FROM eligible GROUP BY {id_column}
            )
            SELECT e.* FROM eligible e
            JOIN latest l ON l.item_id=e.{id_column} AND l.chapter_number=e.chapter_number
        """
        rows = self.conn.execute(sql, (novel_id, lang_id, before_chapter)).fetchall()
        logger.log(TRACE, "Latest snapshot query table=%s novel=%s lang=%s before=%d rows=%d", table, novel_id, lang_id, before_chapter, len(rows))
        return rows

    def _prior_row(self, table: str, id_column: str, item_id: str, novel_id: str, lang_id: str, chapter: int) -> sqlite3.Row | None:
        return self.conn.execute(
            f"""SELECT m.* FROM {table} m
                JOIN chapters c ON c.novel_id=m.novel_id AND c.lang_id=m.lang_id
                               AND c.chapter_number=m.chapter_number AND c.stale=0
                WHERE m.novel_id=? AND m.lang_id=? AND m.{id_column}=? AND m.chapter_number<?
                ORDER BY m.chapter_number DESC LIMIT 1""",
            (novel_id, lang_id, item_id, chapter),
        ).fetchone()

    def _merge_entity_with_prior(self, novel_id: str, lang_id: str, chapter: int, current: EntitySnapshot) -> EntitySnapshot:
        row = self._prior_row("entities", "entity_id", current.entity_id, novel_id, lang_id, chapter)
        if not row:
            return current
        prior = self._entity_from_row(row)
        first_seen = min(x for x in (prior.first_seen_chapter, current.first_seen_chapter) if x is not None)
        return EntitySnapshot(
            entity_id=current.entity_id,
            entity_type=_nonempty(current.entity_type, prior.entity_type),
            source_name=_nonempty(current.source_name, prior.source_name),
            canonical_name=_nonempty(current.canonical_name, prior.canonical_name),
            aliases=_merge_tuple(prior.aliases, current.aliases),
            description=_nonempty(current.description, prior.description),
            biography=_merge_dict(prior.biography, current.biography),
            appearance=_merge_dict(prior.appearance, current.appearance),
            behavior=_merge_dict(prior.behavior, current.behavior),
            characteristics=_merge_dict(prior.characteristics, current.characteristics),
            first_seen_chapter=first_seen,
        )

    def _merge_relationship_with_prior(self, novel_id: str, lang_id: str, chapter: int, current: RelationshipSnapshot) -> RelationshipSnapshot:
        row = self._prior_row("relationships", "relationship_id", current.relationship_id, novel_id, lang_id, chapter)
        if not row:
            return current
        prior = self._relationship_from_row(row)
        return RelationshipSnapshot(
            relationship_id=current.relationship_id,
            source_entity_id=current.source_entity_id or prior.source_entity_id,
            target_entity_id=current.target_entity_id or prior.target_entity_id,
            name=_nonempty(current.name, prior.name),
            description=_nonempty(current.description, prior.description),
            direction=_nonempty(current.direction, prior.direction),
            status=_nonempty(current.status, prior.status),
        )

    def _merge_term_with_prior(self, novel_id: str, lang_id: str, chapter: int, current: TerminologySnapshot) -> TerminologySnapshot:
        row = self._prior_row("terminology", "term_id", current.term_id, novel_id, lang_id, chapter)
        if not row:
            return current
        prior = self._term_from_row(row)
        return TerminologySnapshot(
            term_id=current.term_id,
            source_term=_nonempty(current.source_term, prior.source_term),
            canonical_term=_nonempty(current.canonical_term, prior.canonical_term),
            category=_nonempty(current.category, prior.category),
            translation_rule=_nonempty(current.translation_rule, prior.translation_rule),
            description=_nonempty(current.description, prior.description),
            notes=_nonempty(current.notes, prior.notes),
        )

    def _merge_glossary_with_prior(self, novel_id: str, lang_id: str, chapter: int, current: GlossarySnapshot) -> GlossarySnapshot:
        row = self._prior_row("glossary", "glossary_id", current.glossary_id, novel_id, lang_id, chapter)
        if not row:
            return current
        prior = self._glossary_from_row(row)
        return GlossarySnapshot(
            glossary_id=current.glossary_id,
            term=_nonempty(current.term, prior.term),
            definition=_nonempty(current.definition, prior.definition),
            category=_nonempty(current.category, prior.category),
            aliases=_merge_tuple(prior.aliases, current.aliases),
            notes=_nonempty(current.notes, prior.notes),
        )

    def _merge_arc_with_prior(self, novel_id: str, lang_id: str, chapter: int, current: ArcSnapshot) -> ArcSnapshot:
        row = self._prior_row("arcs", "arc_id", current.arc_id, novel_id, lang_id, chapter)
        if not row:
            return current
        prior = self._arc_from_row(row)
        starts = [x for x in (prior.start_chapter, current.start_chapter) if x is not None]
        return ArcSnapshot(
            arc_id=current.arc_id,
            name=_nonempty(current.name, prior.name),
            status=_nonempty(current.status, prior.status),
            summary=_nonempty(current.summary, prior.summary),
            chapter_role=current.chapter_role,
            start_chapter=min(starts) if starts else None,
            end_chapter=current.end_chapter if current.end_chapter is not None else prior.end_chapter,
        )

    def _merge_style_with_prior(self, novel_id: str, lang_id: str, chapter: int, current: StyleProfile) -> StyleProfile:
        logger.log(TRACE, "Merging style with prior snapshot novel=%s lang=%s chapter=%d", novel_id, lang_id, chapter)
        row = self.conn.execute(
            """SELECT s.* FROM style_profiles s
               JOIN chapters c ON c.novel_id=s.novel_id AND c.lang_id=s.lang_id
                              AND c.chapter_number=s.chapter_number AND c.stale=0
               WHERE s.novel_id=? AND s.lang_id=? AND s.chapter_number<?
               ORDER BY s.chapter_number DESC LIMIT 1""",
            (novel_id, lang_id, chapter),
        ).fetchone()
        if not row:
            return current
        prior = self._style_from_row(row)
        voices = dict(prior.character_voice_rules)
        voices.update({k: v for k, v in current.character_voice_rules.items() if v})
        return StyleProfile(
            narration_pov=_nonempty(current.narration_pov, prior.narration_pov),
            tense=_nonempty(current.tense, prior.tense),
            register=_nonempty(current.register, prior.register),
            dialogue_style=_nonempty(current.dialogue_style, prior.dialogue_style),
            honorific_policy=_nonempty(current.honorific_policy, prior.honorific_policy),
            punctuation=_nonempty(current.punctuation, prior.punctuation),
            prose_rhythm=_nonempty(current.prose_rhythm, prior.prose_rhythm),
            character_voice_rules=voices,
            do_not_change=_merge_tuple(prior.do_not_change, current.do_not_change),
            notes=_nonempty(current.notes, prior.notes),
        )

    @staticmethod
    def _style_has_content(style: StyleProfile) -> bool:
        return any((
            style.narration_pov, style.tense, style.register, style.dialogue_style,
            style.honorific_policy, style.punctuation, style.prose_rhythm,
            style.character_voice_rules, style.do_not_change, style.notes,
        ))

    @staticmethod
    def _entity_from_row(row: sqlite3.Row) -> EntitySnapshot:
        return EntitySnapshot(
            entity_id=row["entity_id"], entity_type=row["entity_type"], source_name=row["source_name"],
            canonical_name=row["canonical_name"], aliases=tuple(_json_load(row["aliases_json"], [])),
            description=row["description"] or "", biography=_json_load(row["biography_json"], {}),
            appearance=_json_load(row["appearance_json"], {}), behavior=_json_load(row["behavior_json"], {}),
            characteristics=_json_load(row["characteristics_json"], {}), first_seen_chapter=row["first_seen_chapter"],
        )

    @staticmethod
    def _relationship_from_row(row: sqlite3.Row) -> RelationshipSnapshot:
        return RelationshipSnapshot(
            relationship_id=row["relationship_id"], source_entity_id=row["source_entity_id"],
            target_entity_id=row["target_entity_id"], name=row["name"], description=row["description"] or "",
            direction=row["direction"] or "directed", status=row["status"] or "active",
        )

    @staticmethod
    def _term_from_row(row: sqlite3.Row) -> TerminologySnapshot:
        return TerminologySnapshot(
            term_id=row["term_id"], source_term=row["source_term"], canonical_term=row["canonical_term"],
            category=row["category"] or "", translation_rule=row["translation_rule"] or "preserve",
            description=row["description"] or "", notes=row["notes"] or "",
        )

    @staticmethod
    def _glossary_from_row(row: sqlite3.Row) -> GlossarySnapshot:
        return GlossarySnapshot(
            glossary_id=row["glossary_id"], term=row["term"], definition=row["definition"],
            category=row["category"] or "", aliases=tuple(_json_load(row["aliases_json"], [])), notes=row["notes"] or "",
        )

    @staticmethod
    def _arc_from_row(row: sqlite3.Row) -> ArcSnapshot:
        return ArcSnapshot(
            arc_id=row["arc_id"], name=row["name"], status=row["status"], summary=row["summary"] or "",
            chapter_role=row["chapter_role"] or "", start_chapter=row["start_chapter"], end_chapter=row["end_chapter"],
        )

    @staticmethod
    def _style_from_row(row: sqlite3.Row) -> StyleProfile:
        return StyleProfile(
            narration_pov=row["narration_pov"] or "", tense=row["tense"] or "", register=row["register"] or "",
            dialogue_style=row["dialogue_style"] or "", honorific_policy=row["honorific_policy"] or "",
            punctuation=row["punctuation"] or "", prose_rhythm=row["prose_rhythm"] or "",
            character_voice_rules=_json_load(row["character_voice_rules_json"], {}),
            do_not_change=tuple(_json_load(row["do_not_change_json"], [])), notes=row["notes"] or "",
        )
