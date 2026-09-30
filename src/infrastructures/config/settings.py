from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from src.applications.services.context_builder import ContextSettings
from src.applications.use_cases.translate_series import TranslationWorkflowSettings


def _first_env(*names: str, default: str | None = None) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value is not None and value.strip() != "":
            return value.strip()
    return default


def _int(name: str, default: int, *aliases: str) -> int:
    raw = _first_env(name, *aliases)
    return int(raw) if raw is not None else default


def _float(name: str, default: float, *aliases: str) -> float:
    raw = _first_env(name, *aliases)
    return float(raw) if raw is not None else default


def _bool(name: str, default: bool, *aliases: str) -> bool:
    raw = _first_env(name, *aliases)
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on", "y"}


@dataclass(frozen=True, slots=True)
class AppSettings:
    root: Path
    raw_story_root: Path
    database_path: Path
    base_url: str
    api_key: str
    model: str
    max_tokens: int
    context_window: int
    compact_threshold: float
    safety_margin_tokens: int
    timeout_seconds: int
    max_retries: int
    retry_base_seconds: float
    translation_temperature: float
    metadata_temperature: float
    repair_temperature: float
    reasoning_effort: str
    token_parameter: str
    previous_chapters: int
    previous_full_chapters: int
    entity_limit: int
    relationship_limit: int
    terminology_limit: int
    glossary_limit: int
    arc_limit: int
    review_mode: str
    strict_sequential: bool

    @classmethod
    def from_env(cls, root: Path | None = None, *, require_llm: bool = True) -> "AppSettings":
        root = (root or Path.cwd()).resolve()
        load_dotenv(root / ".env", override=False)

        base_url = _first_env("BASE_URL", "LLM_BASE_URL", "baseUrl", default="") or ""
        api_key = _first_env("API_KEY", "LLM_API_KEY", "apiKey", default="") or ""
        model = _first_env("MODEL", "LLM_MODEL", "model", default="") or ""
        if require_llm and (not base_url or not api_key or not model):
            missing = [name for name, value in (("BASE_URL", base_url), ("API_KEY", api_key), ("MODEL", model)) if not value]
            raise ValueError(f"Missing required LLM environment variable(s): {', '.join(missing)}")

        max_tokens = _int("MAX_TOKENS", 8192, "LLM_MAX_TOKENS", "maxTokens")
        context_window = _int("CONTEXT_WINDOW", 128000, "LLM_CONTEXT_WINDOW", "contextWindow")
        compact_threshold = _float("COMPACT_THRESHOLD", 0.80, "LLM_COMPACT_THRESHOLD", "compactThreshold")
        if context_window < 4096:
            raise ValueError("CONTEXT_WINDOW must be >= 4096")
        if max_tokens < 256 or max_tokens >= context_window:
            raise ValueError("MAX_TOKENS must be >= 256 and smaller than CONTEXT_WINDOW")
        if not 0.20 <= compact_threshold <= 0.95:
            raise ValueError("COMPACT_THRESHOLD must be between 0.20 and 0.95")

        review_mode = (_first_env("QUALITY_REVIEW", default="adaptive") or "adaptive").lower()
        if review_mode not in {"off", "adaptive", "always"}:
            raise ValueError("QUALITY_REVIEW must be off, adaptive, or always")
        token_parameter = (_first_env("LLM_TOKEN_PARAMETER", default="max_tokens") or "max_tokens").lower()
        if token_parameter not in {"max_tokens", "max_completion_tokens"}:
            raise ValueError("LLM_TOKEN_PARAMETER must be max_tokens or max_completion_tokens")

        raw_root_value = _first_env("RAW_STORY_ROOT", default="story/raw") or "story/raw"
        database_value = _first_env("DATABASE_PATH", default="storage/story.sqlite3") or "storage/story.sqlite3"
        raw_story_root = Path(raw_root_value)
        database_path = Path(database_value)
        if not raw_story_root.is_absolute():
            raw_story_root = root / raw_story_root
        if not database_path.is_absolute():
            database_path = root / database_path

        return cls(
            root=root,
            raw_story_root=raw_story_root.resolve(),
            database_path=database_path.resolve(),
            base_url=base_url.rstrip("/"),
            api_key=api_key,
            model=model,
            max_tokens=max_tokens,
            context_window=context_window,
            compact_threshold=compact_threshold,
            safety_margin_tokens=_int("SAFETY_MARGIN_TOKENS", 2048),
            timeout_seconds=_int("LLM_TIMEOUT_SECONDS", 300),
            max_retries=_int("LLM_MAX_RETRIES", 3),
            retry_base_seconds=_float("LLM_RETRY_BASE_SECONDS", 1.0),
            translation_temperature=_float("TRANSLATION_TEMPERATURE", 0.25),
            metadata_temperature=_float("METADATA_TEMPERATURE", 0.05),
            repair_temperature=_float("REPAIR_TEMPERATURE", 0.10),
            reasoning_effort=_first_env("REASONING_EFFORT", default="") or "",
            token_parameter=token_parameter,
            previous_chapters=max(0, _int("PREVIOUS_CHAPTERS", 3)),
            previous_full_chapters=max(0, _int("PREVIOUS_FULL_CHAPTERS", 1)),
            entity_limit=max(1, _int("CONTEXT_ENTITY_LIMIT", 80)),
            relationship_limit=max(1, _int("CONTEXT_RELATIONSHIP_LIMIT", 120)),
            terminology_limit=max(1, _int("CONTEXT_TERMINOLOGY_LIMIT", 120)),
            glossary_limit=max(1, _int("CONTEXT_GLOSSARY_LIMIT", 80)),
            arc_limit=max(1, _int("CONTEXT_ARC_LIMIT", 12)),
            review_mode=review_mode,
            strict_sequential=_bool("STRICT_SEQUENTIAL", True),
        )

    def context_settings(self) -> ContextSettings:
        return ContextSettings(
            previous_chapters=self.previous_chapters,
            previous_full_chapters=min(self.previous_full_chapters, self.previous_chapters),
            context_window=self.context_window,
            max_output_tokens=self.max_tokens,
            compact_threshold=self.compact_threshold,
            safety_margin_tokens=self.safety_margin_tokens,
            entity_limit=self.entity_limit,
            relationship_limit=self.relationship_limit,
            terminology_limit=self.terminology_limit,
            glossary_limit=self.glossary_limit,
            arc_limit=self.arc_limit,
        )

    def workflow_settings(self) -> TranslationWorkflowSettings:
        return TranslationWorkflowSettings(
            review_mode=self.review_mode,
            strict_sequential=self.strict_sequential,
        )
