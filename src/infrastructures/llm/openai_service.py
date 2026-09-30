from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections.abc import Mapping
from typing import Any

from src.applications.ports.llm import TranslationLLM
from src.applications.services.metadata_normalizer import MetadataNormalizer
from src.applications.services.prompts import METADATA_SYSTEM, REPAIR_SYSTEM, TRANSLATOR_SYSTEM
from src.applications.services.token_budget import estimate_tokens, trim_text_to_tokens
from src.domains.exceptions import ContextWindowError, TranslationError
from src.domains.models import ChapterMetadata, ContextPacket, RawChapter
from src.infrastructures.config.settings import AppSettings

logger = logging.getLogger(__name__)
TRACE = 5


class OpenAITranslationService(TranslationLLM):
    """OpenAI-compatible adapter. No tool loop: two focused calls per normal chapter."""

    def __init__(self, settings: AppSettings):
        try:
            from openai import AsyncOpenAI
        except ImportError as exc:
            raise RuntimeError("The 'openai' package is required. Run: pip install -r requirements.txt") from exc

        self.settings = settings
        self.model_name = settings.model
        self._client = AsyncOpenAI(
            base_url=settings.base_url,
            api_key=settings.api_key,
            timeout=settings.timeout_seconds,
            max_retries=0,
        )
        self._normalizer = MetadataNormalizer()
        logger.info(
            "LLM adapter ready base_url=%s model=%s context_window=%d max_tokens=%d threshold=%.2f safety_margin=%d timeout=%ss retries=%d token_parameter=%s reasoning=%s",
            settings.base_url, settings.model, settings.context_window, settings.max_tokens,
            settings.compact_threshold, settings.safety_margin_tokens, settings.timeout_seconds,
            settings.max_retries, settings.token_parameter, settings.reasoning_effort or "<unset>",
        )
        logger.log(TRACE, "API credential loaded=%s length=%d (value intentionally hidden)", bool(settings.api_key), len(settings.api_key))

    async def translate(
        self,
        chapter: RawChapter,
        context: ContextPacket,
        *,
        target_language: str,
    ) -> str:
        user = (
            f"TARGET LANGUAGE: {target_language}\n"
            f"NOVEL: {chapter.novel_id}\n"
            f"CHAPTER: {chapter.chapter_number}\n\n"
            f"CONTINUITY CONTEXT (constraints, not source text):\n{context.text}\n\n"
            f"CURRENT SOURCE CHAPTER:\n{chapter.source_text}"
        )
        logger.debug(
            "Translation prompt chapter=%d system_tokens~%d context_tokens~%d source_tokens~%d user_tokens~%d output_limit=%d temperature=%.3f",
            chapter.chapter_number, estimate_tokens(TRANSLATOR_SYSTEM), context.estimated_tokens,
            estimate_tokens(chapter.source_text), estimate_tokens(user), self.settings.max_tokens,
            self.settings.translation_temperature,
        )
        self._ensure_fits(TRANSLATOR_SYSTEM, user, self.settings.max_tokens, "translation")
        text = await self._complete(
            stage="translation",
            system=TRANSLATOR_SYSTEM,
            user=user,
            temperature=self.settings.translation_temperature,
            max_tokens=self.settings.max_tokens,
            json_mode=False,
        )
        if not text.strip():
            raise TranslationError(f"LLM returned an empty translation for chapter {chapter.chapter_number}")
        return text.strip()

    async def extract_metadata(
        self,
        chapter: RawChapter,
        translated_text: str,
        context: ContextPacket,
        *,
        target_language: str,
    ) -> ChapterMetadata:
        metadata_max_tokens = min(self.settings.max_tokens, 6000)
        context_text = context.text
        fixed = (
            f"TARGET LANGUAGE: {target_language}\n"
            f"NOVEL: {chapter.novel_id}\n"
            f"CHAPTER: {chapter.chapter_number}\n\n"
            f"SOURCE CHAPTER:\n{chapter.source_text}\n\n"
            f"FINAL TRANSLATION:\n{translated_text}\n\n"
            "PRIOR CONTINUITY CONTEXT:\n"
        )
        budget = self._safe_input_budget(metadata_max_tokens) - estimate_tokens(METADATA_SYSTEM) - estimate_tokens(fixed)
        logger.debug(
            "Metadata prompt chapter=%d metadata_output_limit=%d safe_input=%d system_tokens~%d fixed_tokens~%d prior_context_tokens~%d remaining_context_budget=%d",
            chapter.chapter_number, metadata_max_tokens, self._safe_input_budget(metadata_max_tokens),
            estimate_tokens(METADATA_SYSTEM), estimate_tokens(fixed), estimate_tokens(context_text), budget,
        )
        if budget < 0:
            raise ContextWindowError(
                f"Chapter {chapter.chapter_number} source + translation do not fit the metadata pass. "
                "Increase CONTEXT_WINDOW or reduce MAX_TOKENS."
            )
        if estimate_tokens(context_text) > budget:
            before_tokens = estimate_tokens(context_text)
            context_text = trim_text_to_tokens(context_text, max(0, budget))
            logger.warning(
                "Metadata prior-context compacted chapter=%d from~%d to~%d tokens",
                chapter.chapter_number, before_tokens, estimate_tokens(context_text),
            )
        user = fixed + context_text
        self._ensure_fits(METADATA_SYSTEM, user, metadata_max_tokens, "metadata extraction")
        raw = await self._complete(
            stage="metadata",
            system=METADATA_SYSTEM,
            user=user,
            temperature=self.settings.metadata_temperature,
            max_tokens=metadata_max_tokens,
            json_mode=True,
        )
        logger.log(TRACE, "Metadata raw response chapter=%d chars=%d estimated_tokens=%d preview=%r", chapter.chapter_number, len(raw), estimate_tokens(raw), raw[:240])
        payload = self._parse_json_object(raw)
        logger.debug("Metadata JSON parsed chapter=%d top_level_keys=%s", chapter.chapter_number, sorted(str(k) for k in payload.keys()))
        normalized = self._normalizer.normalize(payload, chapter_number=chapter.chapter_number, context=context)
        logger.debug(
            "Metadata normalized chapter=%d entities=%d relationships=%d terminology=%d glossary=%d arcs=%d flags=%d",
            chapter.chapter_number, len(normalized.entities), len(normalized.relationships), len(normalized.terminology),
            len(normalized.glossary), len(normalized.arcs), len(normalized.quality_flags),
        )
        return normalized

    async def repair_translation(
        self,
        chapter: RawChapter,
        translated_text: str,
        context: ContextPacket,
        issues: list[str],
        *,
        target_language: str,
    ) -> str:
        issue_text = "\n".join(f"- {issue}" for issue in issues)
        user = (
            f"TARGET LANGUAGE: {target_language}\n"
            f"NOVEL: {chapter.novel_id}\n"
            f"CHAPTER: {chapter.chapter_number}\n\n"
            f"ISSUES TO REPAIR:\n{issue_text}\n\n"
            f"CONTINUITY CONTEXT:\n{context.text}\n\n"
            f"SOURCE CHAPTER:\n{chapter.source_text}\n\n"
            f"TRANSLATION TO REPAIR:\n{translated_text}"
        )
        logger.debug(
            "Repair prompt chapter=%d issues=%d system_tokens~%d user_tokens~%d output_limit=%d temperature=%.3f",
            chapter.chapter_number, len(issues), estimate_tokens(REPAIR_SYSTEM), estimate_tokens(user),
            self.settings.max_tokens, self.settings.repair_temperature,
        )
        self._ensure_fits(REPAIR_SYSTEM, user, self.settings.max_tokens, "repair")
        text = await self._complete(
            stage="repair",
            system=REPAIR_SYSTEM,
            user=user,
            temperature=self.settings.repair_temperature,
            max_tokens=self.settings.max_tokens,
            json_mode=False,
        )
        if not text.strip():
            raise TranslationError(f"LLM returned an empty repaired translation for chapter {chapter.chapter_number}")
        return text.strip()

    def _safe_input_budget(self, output_tokens: int) -> int:
        return (
            int(self.settings.context_window * self.settings.compact_threshold)
            - output_tokens
            - self.settings.safety_margin_tokens
        )

    def _ensure_fits(self, system: str, user: str, output_tokens: int, stage: str) -> None:
        system_tokens = estimate_tokens(system)
        user_tokens = estimate_tokens(user)
        estimated = system_tokens + user_tokens
        safe = self._safe_input_budget(output_tokens)
        logger.debug(
            "Context fit check stage=%s system~%d user~%d total_input~%d safe_input=%d remaining=%d output_reserve=%d",
            stage, system_tokens, user_tokens, estimated, safe, safe - estimated, output_tokens,
        )
        if estimated > safe:
            raise ContextWindowError(
                f"Estimated {stage} input ({estimated:,} tokens) exceeds safe budget ({safe:,}). "
                "Increase CONTEXT_WINDOW/COMPACT_THRESHOLD, lower MAX_TOKENS, or shorten source chapters."
            )

    async def _complete(
        self,
        *,
        stage: str,
        system: str,
        user: str,
        temperature: float,
        max_tokens: int,
        json_mode: bool,
    ) -> str:
        last_error: Exception | None = None
        for attempt in range(self.settings.max_retries + 1):
            started = time.perf_counter()
            try:
                kwargs: dict[str, Any] = {
                    "model": self.settings.model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "temperature": temperature,
                }
                kwargs[self.settings.token_parameter] = max_tokens
                if self.settings.reasoning_effort:
                    kwargs["reasoning_effort"] = self.settings.reasoning_effort
                if json_mode:
                    kwargs["response_format"] = {"type": "json_object"}
                logger.info(
                    "LLM request stage=%s attempt=%d/%d model=%s input_tokens~%d output_limit=%d temperature=%s json_mode=%s reasoning=%s",
                    stage, attempt + 1, self.settings.max_retries + 1, self.settings.model,
                    estimate_tokens(system) + estimate_tokens(user), max_tokens,
                    kwargs.get("temperature", "<omitted>"), json_mode, kwargs.get("reasoning_effort", "<omitted>"),
                )
                logger.log(TRACE, "LLM request keys stage=%s keys=%s", stage, sorted(kwargs.keys()))
                response = await self._create_with_compatibility_fallbacks(kwargs, stage=stage)
                choice = response.choices[0]
                message = choice.message
                usage = getattr(response, "usage", None)
                logger.info(
                    "LLM response stage=%s finish_reason=%s elapsed=%.3fs usage_prompt=%s usage_completion=%s usage_total=%s",
                    stage, getattr(choice, "finish_reason", None), time.perf_counter() - started,
                    getattr(usage, "prompt_tokens", None), getattr(usage, "completion_tokens", None), getattr(usage, "total_tokens", None),
                )
                if getattr(choice, "finish_reason", None) == "length":
                    raise TranslationError(
                        f"LLM output hit the configured token limit ({max_tokens}). Increase MAX_TOKENS "
                        "and ensure it remains below CONTEXT_WINDOW."
                    )
                refusal = getattr(message, "refusal", None)
                if refusal:
                    raise TranslationError(f"LLM refused the request: {refusal}")
                content = message.content
                if isinstance(content, str):
                    logger.debug(
                        "LLM content stage=%s chars=%d estimated_tokens=%d preview=%r",
                        stage, len(content), estimate_tokens(content), content[:180].replace("\n", " "),
                    )
                    return content
                if content is None:
                    return ""
                return str(content)
            except Exception as exc:  # provider-specific exception classes vary across compatible APIs
                last_error = exc
                retryable = self._retryable(exc)
                logger.warning(
                    "LLM request error stage=%s attempt=%d status=%s retryable=%s elapsed=%.3fs error=%s",
                    stage, attempt + 1, getattr(exc, "status_code", None), retryable,
                    time.perf_counter() - started, exc,
                )
                if attempt >= self.settings.max_retries or not retryable:
                    break
                delay = self.settings.retry_base_seconds * (2 ** attempt)
                logger.info("LLM retry scheduled stage=%s delay=%.2fs", stage, delay)
                await asyncio.sleep(delay)
        raise TranslationError(f"LLM request failed after retries: {last_error}") from last_error


    async def _create_with_compatibility_fallbacks(self, kwargs: dict[str, Any], *, stage: str):
        """Retry only unsupported-parameter 400s without consuming the transient retry budget."""
        attempted_swapped_token_parameter = False
        while True:
            try:
                return await self._client.chat.completions.create(**kwargs)
            except Exception as exc:
                if not self._looks_like_unsupported_parameter(exc):
                    raise
                text = str(exc).lower()
                removed = False
                for key in ("response_format", "reasoning_effort", "temperature"):
                    if key in kwargs and key.lower() in text:
                        kwargs.pop(key, None)
                        logger.warning("Provider compatibility fallback stage=%s removed unsupported parameter=%s", stage, key)
                        removed = True
                        break
                if removed:
                    continue
                if (
                    not attempted_swapped_token_parameter
                    and "max_tokens" in kwargs
                    and "max_tokens" in text
                ):
                    kwargs["max_completion_tokens"] = kwargs.pop("max_tokens")
                    attempted_swapped_token_parameter = True
                    logger.warning("Provider compatibility fallback stage=%s swapped max_tokens -> max_completion_tokens", stage)
                    continue
                raise

    @staticmethod
    def _retryable(exc: Exception) -> bool:
        status = getattr(exc, "status_code", None)
        if status in {408, 409, 429} or (isinstance(status, int) and status >= 500):
            return True
        text = str(exc).lower()
        return any(token in text for token in ("timeout", "timed out", "rate limit", "temporarily", "connection"))

    @staticmethod
    def _looks_like_unsupported_parameter(exc: Exception) -> bool:
        status = getattr(exc, "status_code", None)
        text = str(exc).lower()
        parameter_words = ("response_format", "reasoning_effort", "temperature", "max_tokens", "parameter", "argument")
        problem_words = ("unsupported", "unknown", "invalid", "not support", "not allowed", "unrecognized")
        return (status in (None, 400, 422)) and any(x in text for x in parameter_words) and any(x in text for x in problem_words)

    @staticmethod
    def _parse_json_object(raw: str) -> Mapping[str, Any]:
        text = raw.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
            text = re.sub(r"\s*```$", "", text)
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start < 0 or end <= start:
                raise TranslationError(f"Metadata response is not valid JSON: {text[:500]}")
            try:
                parsed = json.loads(text[start:end + 1])
            except json.JSONDecodeError as exc:
                raise TranslationError(f"Metadata response is not valid JSON: {text[:500]}") from exc
        if not isinstance(parsed, Mapping):
            raise TranslationError("Metadata response must be a JSON object")
        return parsed
