from __future__ import annotations

from typing import Protocol

from src.domains.models import ChapterMetadata, ContextPacket, RawChapter


class TranslationLLM(Protocol):
    model_name: str

    async def translate(
        self,
        chapter: RawChapter,
        context: ContextPacket,
        *,
        target_language: str,
    ) -> str: ...

    async def extract_metadata(
        self,
        chapter: RawChapter,
        translated_text: str,
        context: ContextPacket,
        *,
        target_language: str,
    ) -> ChapterMetadata: ...

    async def repair_translation(
        self,
        chapter: RawChapter,
        translated_text: str,
        context: ContextPacket,
        issues: list[str],
        *,
        target_language: str,
    ) -> str: ...
