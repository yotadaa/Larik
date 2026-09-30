from __future__ import annotations

from typing import Protocol

from src.domains.models import RawChapter


class RawStorySource(Protocol):
    def discover_series(self) -> list[str]: ...

    def list_chapter_numbers(self, novel_id: str) -> list[int]: ...

    def read_chapter(self, novel_id: str, chapter_number: int) -> RawChapter: ...
