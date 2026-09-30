from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path

from src.applications.ports.source import RawStorySource
from src.domains.exceptions import SourceChapterError
from src.domains.models import RawChapter


_CHAPTER_PATTERNS = (
    re.compile(r"(?:^|[-_\s])chapters?[-_\s]*(\d+)(?:\D|$)", re.IGNORECASE),
    re.compile(r"(?:^|[-_\s])ch[-_\s]*(\d+)(?:\D|$)", re.IGNORECASE),
    re.compile(r"^(\d+)(?:\D|$)"),
)
_TITLE_RE = re.compile(r"^#{1,6}\s+(.+?)\s*$")

logger = logging.getLogger(__name__)
TRACE = 5


class FileSystemRawStorySource(RawStorySource):
    def __init__(self, raw_root: str | Path):
        self.raw_root = Path(raw_root).resolve()
        # A translation run may touch hundreds of chapters. Rewalking the entire
        # series directory for every chapter is O(chapters x files) and becomes
        # surprisingly expensive on large novels. Cache only the immutable path
        # index; chapter text is still read fresh so source edits are picked up.
        self._chapter_maps: dict[str, dict[int, Path]] = {}

    def discover_series(self) -> list[str]:
        logger.log(TRACE, "Scanning raw story root: %s", self.raw_root)
        if not self.raw_root.exists():
            logger.warning("Raw story root does not exist: %s", self.raw_root)
            return []
        series = sorted(path.name for path in self.raw_root.iterdir() if path.is_dir())
        logger.debug("Discovered %d series: %s", len(series), series)
        return series

    def list_chapter_numbers(self, novel_id: str) -> list[int]:
        chapters = sorted(self._chapter_map(novel_id))
        logger.debug(
            "Raw chapter index built novel=%s count=%d first=%s last=%s",
            novel_id,
            len(chapters),
            chapters[0] if chapters else None,
            chapters[-1] if chapters else None,
        )
        return chapters

    def read_chapter(self, novel_id: str, chapter_number: int) -> RawChapter:
        chapter_map = self._chapter_map(novel_id)
        path = chapter_map.get(chapter_number)
        if not path:
            raise SourceChapterError(f"Raw chapter {chapter_number} not found for {novel_id!r}.")
        logger.log(TRACE, "Opening raw chapter novel=%s chapter=%d path=%s", novel_id, chapter_number, path)
        text = path.read_text(encoding="utf-8-sig")
        if not text.strip():
            raise SourceChapterError(f"Raw chapter file is empty: {path}")
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        title = self._extract_title(text, chapter_number)
        logger.debug(
            "Raw chapter loaded novel=%s chapter=%d chars=%d lines=%d sha256=%s title=%r",
            novel_id, chapter_number, len(text), len(text.splitlines()), digest[:16], title,
        )
        return RawChapter(
            novel_id=novel_id,
            chapter_number=chapter_number,
            path=path,
            source_text=text,
            source_hash=digest,
            title=title,
        )

    def _chapter_map(self, novel_id: str) -> dict[int, Path]:
        cached = self._chapter_maps.get(novel_id)
        if cached is not None:
            logger.log(TRACE, "Raw chapter index cache hit novel=%s files=%d", novel_id, len(cached))
            return cached

        series_dir = (self.raw_root / novel_id).resolve()
        if self.raw_root not in series_dir.parents:
            raise SourceChapterError("Invalid novel_id path traversal")
        if not series_dir.is_dir():
            raise SourceChapterError(f"Raw novel directory does not exist: {series_dir}")

        logger.log(TRACE, "Walking raw series directory: %s", series_dir)
        found: dict[int, Path] = {}
        duplicates: dict[int, list[Path]] = {}
        for path in sorted(series_dir.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in {".md", ".txt"}:
                continue
            number = self._chapter_number(path.stem)
            if number is None:
                continue
            if number in found:
                duplicates.setdefault(number, [found[number]]).append(path)
            else:
                found[number] = path
        logger.log(TRACE, "Raw series scan complete novel=%s matched_files=%d", novel_id, len(found))
        if duplicates:
            details = "; ".join(
                f"chapter {number}: {', '.join(str(p.relative_to(series_dir)) for p in paths)}"
                for number, paths in sorted(duplicates.items())
            )
            raise SourceChapterError(f"Duplicate raw chapter numbers detected ({details})")
        self._chapter_maps[novel_id] = found
        logger.debug("Cached raw chapter index novel=%s files=%d", novel_id, len(found))
        return found

    @staticmethod
    def _chapter_number(stem: str) -> int | None:
        for pattern in _CHAPTER_PATTERNS:
            match = pattern.search(stem)
            if match:
                return int(match.group(1))
        return None

    @staticmethod
    def _extract_title(text: str, chapter_number: int) -> str:
        fallback = f"Chapter {chapter_number}"
        headings: list[str] = []
        for line in text.splitlines()[:80]:
            match = _TITLE_RE.match(line.strip())
            if match:
                headings.append(match.group(1).strip())
        # Prefer a specific chapter heading over a website/document wrapper heading.
        for heading in reversed(headings):
            if re.search(rf"\bchapter\s*{chapter_number}\b", heading, re.IGNORECASE):
                return heading
        return headings[0] if headings else fallback
