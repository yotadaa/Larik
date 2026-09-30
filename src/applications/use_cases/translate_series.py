from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Callable

from src.applications.ports.llm import TranslationLLM
from src.applications.ports.repositories import StoryRepository
from src.applications.ports.source import RawStorySource
from src.applications.services.context_builder import ContextBuilder
from src.applications.services.prompts import PROMPT_VERSION
from src.applications.services.quality import TranslationQualityChecker
from src.domains.exceptions import MetadataValidationError, SourceChapterError, TranslationStoppedError
from src.domains.models import RawChapter, TranslationResult

logger = logging.getLogger(__name__)
TRACE = 5


EventSink = Callable[[dict], None]


@dataclass(frozen=True, slots=True)
class TranslationWorkflowSettings:
    review_mode: str = "adaptive"  # off | adaptive | always
    strict_sequential: bool = True


@dataclass(frozen=True, slots=True)
class RunSummary:
    run_id: str
    novel_id: str
    lang_id: str
    processed: tuple[int, ...]
    skipped: tuple[int, ...]


class TranslateSeries:
    def __init__(
        self,
        *,
        source: RawStorySource,
        repository: StoryRepository,
        llm: TranslationLLM,
        context_builder: ContextBuilder,
        quality_checker: TranslationQualityChecker | None = None,
        settings: TranslationWorkflowSettings | None = None,
        emit: EventSink | None = None,
    ):
        self.source = source
        self.repository = repository
        self.llm = llm
        self.context_builder = context_builder
        self.quality_checker = quality_checker or TranslationQualityChecker()
        self.settings = settings or TranslationWorkflowSettings()
        self.emit = emit or (lambda _event: None)
        self._progress_current = 0
        self._progress_total = 0

    async def execute(
        self,
        novel_id: str,
        lang_id: str,
        *,
        start: int | None = None,
        end: int | None = None,
        force: bool = False,
        max_chapters: int | None = None,
        run_id: str | None = None,
    ) -> RunSummary:
        run_started = time.perf_counter()
        logger.info(
            "Translation run requested novel=%s lang=%s start=%s end=%s force=%s max_chapters=%s strict=%s review=%s",
            novel_id, lang_id, start, end, force, max_chapters, self.settings.strict_sequential, self.settings.review_mode,
        )
        available = self.source.list_chapter_numbers(novel_id)
        logger.debug("Available raw chapters count=%d range=%s..%s", len(available), available[0] if available else None, available[-1] if available else None)
        if not available:
            raise SourceChapterError(f"No raw chapters found for {novel_id!r}.")

        first_available = available[0]
        last_available = available[-1]
        start = first_available if start is None else start
        end = last_available if end is None else end
        if start > end:
            raise SourceChapterError("start chapter must be <= end chapter")
        selected = [n for n in available if start <= n <= end]
        if not selected:
            raise SourceChapterError(f"No raw chapters exist in requested range {start}-{end}.")
        if max_chapters is not None:
            selected = selected[: max(0, max_chapters)]
        if not selected:
            raise SourceChapterError("max_chapters resulted in an empty run")

        if self.settings.strict_sequential and selected[0] > first_available:
            previous = max((n for n in available if n < selected[0]), default=None)
            if previous is not None and not self.repository.has_completed_chapter(novel_id, lang_id, previous):
                raise SourceChapterError(
                    f"Sequential context is incomplete: chapter {previous} has not been translated for "
                    f"{novel_id}/{lang_id}. Process earlier chapters first or disable strict mode explicitly."
                )

        run_id = run_id or uuid.uuid4().hex
        logger.info("Run created id=%s selected_count=%d selected_range=%d..%d", run_id, len(selected), selected[0], selected[-1])
        self.repository.start_run(run_id, novel_id, lang_id, selected[0], selected[-1])
        processed: list[int] = []
        skipped: list[int] = []
        prefetched_number: int | None = None
        prefetch_task: asyncio.Task[RawChapter] | None = None

        try:
            for index, chapter_number in enumerate(selected, 1):
                self._progress_current = index
                self._progress_total = len(selected)
                chapter_started = time.perf_counter()
                self._emit(run_id, chapter_number, "chapter", f"Start chapter {index}/{len(selected)}")
                self._emit(run_id, chapter_number, "read", f"Reading raw chapter ({index}/{len(selected)})")
                t0 = time.perf_counter()
                if prefetch_task is not None and prefetched_number == chapter_number:
                    chapter = await prefetch_task
                    prefetch_task = None
                    prefetched_number = None
                    read_mode = "prefetched"
                else:
                    chapter = self.source.read_chapter(novel_id, chapter_number)
                    read_mode = "direct"
                self._emit(
                    run_id, chapter_number, "read",
                    f"Loaded {chapter.path} chars={len(chapter.source_text):,} hash={chapter.source_hash[:16]} "
                    f"mode={read_mode} in {time.perf_counter()-t0:.3f}s",
                )

                # Safe look-ahead: only raw file I/O/hash work is overlapped with the
                # current chapter. We deliberately do NOT build next-chapter context
                # or call the LLM early because both depend on metadata committed by
                # the current chapter. This preserves strict continuity semantics.
                if index < len(selected):
                    next_chapter = selected[index]
                    prefetched_number = next_chapter
                    prefetch_task = asyncio.create_task(
                        asyncio.to_thread(self.source.read_chapter, novel_id, next_chapter),
                        name=f"raw-prefetch-{novel_id}-{next_chapter}",
                    )
                    logger.debug(
                        "Scheduled safe raw prefetch novel=%s current=%d next=%d",
                        novel_id, chapter_number, next_chapter,
                    )

                self._emit(run_id, chapter_number, "cache", "Checking source/model/prompt fingerprint against SQLite")
                if not force and self.repository.is_chapter_current(
                    novel_id,
                    lang_id,
                    chapter_number,
                    chapter.source_hash,
                    PROMPT_VERSION,
                    self.llm.model_name,
                ):
                    skipped.append(chapter_number)
                    self._emit(run_id, chapter_number, "skip", "Already current; skipping LLM calls")
                    self._emit(run_id, chapter_number, "chapter", f"Finished by cache hit in {time.perf_counter()-chapter_started:.3f}s")
                    continue
                self._emit(run_id, chapter_number, "cache", "No current cache hit; LLM pipeline required")

                self._emit(run_id, chapter_number, "context", "Building bounded continuity context")
                t0 = time.perf_counter()
                context = self.context_builder.build(chapter, lang_id)
                self._emit(
                    run_id,
                    chapter_number,
                    "context",
                    f"Context ready (~{context.estimated_tokens:,} tokens; previous={list(context.included_previous_chapters)}; "
                    f"entities={len(context.relevant_entity_ids)}; terms={len(context.relevant_term_ids)}; "
                    f"fingerprint={context.context_fingerprint[:16]}; elapsed={time.perf_counter()-t0:.3f}s)",
                )

                self._emit(run_id, chapter_number, "translate", "Preparing translation LLM request")
                t0 = time.perf_counter()
                translated = await self.llm.translate(chapter, context, target_language=lang_id)
                self._emit(
                    run_id, chapter_number, "translate",
                    f"Translation returned chars={len(translated):,} elapsed={time.perf_counter()-t0:.3f}s",
                )
                self._emit(run_id, chapter_number, "quality", "Running deterministic translation checks")
                deterministic_issues = self.quality_checker.check(chapter.source_text, translated)
                self._emit(
                    run_id, chapter_number, "quality",
                    "No deterministic issues" if not deterministic_issues else "Issues: " + "; ".join(deterministic_issues),
                )

                self._emit(run_id, chapter_number, "metadata", "Extracting compact continuity metadata")
                t0 = time.perf_counter()
                metadata = await self.llm.extract_metadata(
                    chapter,
                    translated,
                    context,
                    target_language=lang_id,
                )
                self._emit(
                    run_id, chapter_number, "metadata",
                    f"Metadata returned entities={len(metadata.entities)} relationships={len(metadata.relationships)} "
                    f"terminology={len(metadata.terminology)} glossary={len(metadata.glossary)} arcs={len(metadata.arcs)} "
                    f"quality_flags={len(metadata.quality_flags)} elapsed={time.perf_counter()-t0:.3f}s",
                )
                if not metadata.summary.strip():
                    raise MetadataValidationError(
                        f"LLM metadata for chapter {chapter_number} did not include a continuity summary."
                    )

                review_issues = list(dict.fromkeys([*deterministic_issues, *metadata.quality_flags]))
                if self._should_repair(review_issues):
                    self._emit(
                        run_id,
                        chapter_number,
                        "repair",
                        "Quality repair triggered: " + "; ".join(review_issues),
                    )
                    t0 = time.perf_counter()
                    translated = await self.llm.repair_translation(
                        chapter,
                        translated,
                        context,
                        review_issues or ["perform a final consistency review"],
                        target_language=lang_id,
                    )
                    self._emit(
                        run_id, chapter_number, "repair",
                        f"Repair response chars={len(translated):,} elapsed={time.perf_counter()-t0:.3f}s",
                    )
                    post_issues = self.quality_checker.check(chapter.source_text, translated)
                    if post_issues:
                        self._emit(
                            run_id,
                            chapter_number,
                            "repair",
                            "Repair completed with remaining heuristic warnings: " + "; ".join(post_issues),
                        )
                    # Metadata must describe the final text, not the pre-repair draft.
                    self._emit(run_id, chapter_number, "metadata", "Re-extracting metadata from repaired final text")
                    t0 = time.perf_counter()
                    metadata = await self.llm.extract_metadata(
                        chapter,
                        translated,
                        context,
                        target_language=lang_id,
                    )
                    self._emit(
                        run_id, chapter_number, "metadata",
                        f"Post-repair metadata entities={len(metadata.entities)} relationships={len(metadata.relationships)} "
                        f"terminology={len(metadata.terminology)} glossary={len(metadata.glossary)} arcs={len(metadata.arcs)} "
                        f"elapsed={time.perf_counter()-t0:.3f}s",
                    )
                    if not metadata.summary.strip():
                        raise MetadataValidationError(
                            f"LLM metadata after repair for chapter {chapter_number} has no summary."
                        )

                result = TranslationResult(
                    raw_chapter=chapter,
                    translated_text=translated.strip(),
                    metadata=metadata,
                    context_fingerprint=context.context_fingerprint,
                    model=self.llm.model_name,
                    prompt_version=PROMPT_VERSION,
                )
                self._emit(run_id, chapter_number, "commit", "Writing chapter + metadata atomically to SQLite")
                t0 = time.perf_counter()
                self.repository.save_translation(result, lang_id)
                processed.append(chapter_number)
                self._emit(run_id, chapter_number, "commit", f"SQLite commit completed in {time.perf_counter()-t0:.3f}s")
                self._emit(run_id, chapter_number, "done", f"Chapter completed in {time.perf_counter()-chapter_started:.3f}s")

            self.repository.finish_run(run_id, "completed")
            logger.info(
                "Run completed id=%s processed=%s skipped=%s elapsed=%.3fs",
                run_id, processed, skipped, time.perf_counter()-run_started,
            )
            return RunSummary(run_id, novel_id, lang_id, tuple(processed), tuple(skipped))
        except TranslationStoppedError as exc:
            logger.warning("Run stopped id=%s after %.3fs: %s", run_id, time.perf_counter()-run_started, exc)
            self.repository.finish_run(run_id, "stopped", str(exc))
            raise
        except Exception as exc:
            logger.exception("Run failed id=%s after %.3fs: %s", run_id, time.perf_counter()-run_started, exc)
            self.repository.finish_run(run_id, "failed", str(exc))
            raise
        finally:
            if prefetch_task is not None:
                if not prefetch_task.done():
                    prefetch_task.cancel()
                    logger.log(TRACE, "Cancelled unused raw prefetch novel=%s chapter=%s", novel_id, prefetched_number)
                # Consume cancellation/read errors so a failed run never leaves an
                # orphaned task warning behind. asyncio.to_thread may finish its
                # underlying file read, but its result is intentionally discarded.
                await asyncio.gather(prefetch_task, return_exceptions=True)

    def _should_repair(self, issues: list[str]) -> bool:
        mode = self.settings.review_mode.strip().lower()
        if mode == "always":
            return True
        if mode == "off":
            return False
        return bool(issues)

    def _emit(self, run_id: str, chapter: int, stage: str, message: str) -> None:
        logger.log(TRACE, "workflow event chapter=%d stage=%s message=%s", chapter, stage, message)
        self.emit({
            "run_id": run_id,
            "chapter": chapter,
            "stage": stage,
            "message": message,
            "progress_current": self._progress_current,
            "progress_total": self._progress_total,
        })
