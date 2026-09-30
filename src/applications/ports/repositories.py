from __future__ import annotations

from typing import Protocol

from src.domains.models import (
    ArcSnapshot,
    ChapterMetadata,
    EntitySnapshot,
    GlossarySnapshot,
    PreviousChapter,
    RelationshipSnapshot,
    StyleProfile,
    TerminologySnapshot,
    TranslationResult,
)


class StoryRepository(Protocol):
    def initialize(self) -> None: ...

    def is_chapter_current(
        self,
        novel_id: str,
        lang_id: str,
        chapter_number: int,
        source_hash: str,
        prompt_version: str,
        model: str,
    ) -> bool: ...

    def has_completed_chapter(self, novel_id: str, lang_id: str, chapter_number: int) -> bool: ...

    def previous_chapters(
        self,
        novel_id: str,
        lang_id: str,
        before_chapter: int,
        limit: int,
    ) -> list[PreviousChapter]: ...

    def latest_style(self, novel_id: str, lang_id: str, before_chapter: int) -> StyleProfile | None: ...

    def relevant_entities(
        self,
        novel_id: str,
        lang_id: str,
        before_chapter: int,
        source_text: str,
        *,
        recent_from_chapter: int,
        limit: int,
    ) -> list[EntitySnapshot]: ...

    def relevant_relationships(
        self,
        novel_id: str,
        lang_id: str,
        before_chapter: int,
        entity_ids: list[str],
        *,
        recent_from_chapter: int,
        limit: int,
    ) -> list[RelationshipSnapshot]: ...

    def relevant_terminology(
        self,
        novel_id: str,
        lang_id: str,
        before_chapter: int,
        source_text: str,
        *,
        recent_from_chapter: int,
        limit: int,
    ) -> list[TerminologySnapshot]: ...

    def relevant_glossary(
        self,
        novel_id: str,
        lang_id: str,
        before_chapter: int,
        source_text: str,
        *,
        recent_from_chapter: int,
        limit: int,
    ) -> list[GlossarySnapshot]: ...

    def active_arcs(
        self,
        novel_id: str,
        lang_id: str,
        before_chapter: int,
        limit: int,
    ) -> list[ArcSnapshot]: ...

    def save_translation(self, result: TranslationResult, lang_id: str) -> None: ...

    def start_run(self, run_id: str, novel_id: str, lang_id: str, start: int, end: int) -> None: ...

    def finish_run(self, run_id: str, status: str, message: str = "") -> None: ...

    def chapter_count(self, novel_id: str, lang_id: str) -> int: ...

    def metadata_counts(self, novel_id: str, lang_id: str) -> dict[str, int]: ...
