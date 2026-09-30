from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)
TRACE = 5


class TranslationQualityChecker:
    """Fast deterministic checks; LLM repair is only triggered when needed."""

    def check(self, source: str, translation: str) -> list[str]:
        issues: list[str] = []
        source_clean = source.strip()
        translated_clean = translation.strip()
        if not translated_clean:
            return ["translation is empty"]
        if translated_clean.startswith("{") and '"translation"' in translated_clean[:300]:
            issues.append("translation appears to contain a JSON wrapper instead of chapter text")
        if "```json" in translated_clean[:500].lower():
            issues.append("translation contains an unexpected JSON code fence")

        source_words = max(1, len(re.findall(r"\S+", source_clean)))
        translated_words = len(re.findall(r"\S+", translated_clean))
        ratio = translated_words / source_words
        logger.log(TRACE, "Quality check source_words=%d translated_words=%d ratio=%.3f", source_words, translated_words, ratio)
        if ratio < 0.35:
            issues.append(f"translation is suspiciously short (word ratio {ratio:.2f})")
        elif ratio > 3.0:
            issues.append(f"translation is suspiciously long (word ratio {ratio:.2f})")

        source_headings = len(re.findall(r"(?m)^#{1,6}\s+", source_clean))
        translated_headings = len(re.findall(r"(?m)^#{1,6}\s+", translated_clean))
        if source_headings and translated_headings == 0:
            issues.append("markdown heading structure was lost")
        logger.debug(
            "Quality check complete issues=%d source_headings=%d translated_headings=%d details=%s",
            len(issues), source_headings, translated_headings, issues,
        )
        return issues
