from __future__ import annotations

from typing import Any

from src.applications.ports.preview import PreviewRepository


class PreviewQueries:
    def __init__(self, repository: PreviewRepository):
        self.repository = repository

    def overview(self) -> dict[str, Any]:
        return self.repository.preview_overview()

    def novel(self, novel_id: str, lang_id: str) -> dict[str, Any]:
        return self.repository.preview_novel(novel_id, lang_id)

    def chapter(self, novel_id: str, lang_id: str, chapter_number: int) -> dict[str, Any] | None:
        return self.repository.preview_chapter(novel_id, lang_id, chapter_number)

    def atlas(self, novel_id: str, lang_id: str) -> dict[str, Any]:
        return {
            "entities": self.repository.preview_entities(novel_id, lang_id),
            "relationships": self.repository.preview_relationships(novel_id, lang_id),
            "terminology": self.repository.preview_terminology(novel_id, lang_id),
            "glossary": self.repository.preview_glossary(novel_id, lang_id),
            "arcs": self.repository.preview_arcs(novel_id, lang_id),
            "runs": self.repository.preview_runs(novel_id, lang_id),
        }
