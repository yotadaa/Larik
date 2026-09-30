from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

from src.applications.services.context_builder import ContextBuilder
from src.applications.services.quality import TranslationQualityChecker
from src.applications.use_cases.translate_series import TranslateSeries, TranslationWorkflowSettings
from src.domains.exceptions import TranslationError
from src.infrastructures.config.settings import AppSettings
from src.infrastructures.database.repository import SQLiteStoryRepository
from src.infrastructures.llm.openai_service import OpenAITranslationService
from src.infrastructures.repositories.raw_story_repository import FileSystemRawStorySource
from src.presentations.logging_config import configure_logging
from src.presentations.preview_server import run_preview_server

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="larik",
        description="Sequential multi-series novel translator with compact temporal metadata.",
    )
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="Project root (default: current directory)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init-db", help="Create/upgrade the SQLite schema")
    sub.add_parser("list", help="List novel series under story/raw")

    status = sub.add_parser("status", help="Show translated chapter and metadata counts")
    status.add_argument("novel_id")
    status.add_argument("--lang", default="id")

    translate = sub.add_parser("translate", help="Translate a sequential chapter range")
    translate.add_argument("novel_id")
    translate.add_argument("--lang", default="id", help="Target language id (default: id)")
    translate.add_argument("--start", type=int)
    translate.add_argument("--end", type=int)
    translate.add_argument("--max-chapters", type=int, help="Safety cap for this invocation")
    translate.add_argument("--force", action="store_true", help="Retranslate even when source/model/prompt are current")
    translate.add_argument("--allow-context-gap", action="store_true", help="Allow starting after an untranslated previous chapter")
    translate.add_argument("--quiet", action="store_true", help="Suppress verbose process logs")
    translate.add_argument(
        "--log-level",
        choices=("trace", "debug", "info", "warning", "error"),
        default="trace",
        help="Process log detail. Default: trace (very verbose)",
    )
    translate.add_argument("--log-file", help="Optional file that receives the same verbose logs")

    preview = sub.add_parser("preview", help="Serve the SQLite preview API and built React preview")
    preview.add_argument("--host", default="127.0.0.1")
    preview.add_argument("--port", type=int, default=8787)
    preview.add_argument("--log-level", choices=("trace", "debug", "info", "warning", "error"), default="info")
    return parser


def _event_printer(event: dict) -> None:
    chapter = event.get("chapter")
    stage = event.get("stage", "pipeline")
    message = event.get("message", "")
    print(f"[ch {chapter:04d}] {stage:>9} | {message}", file=sys.stderr, flush=True)


def _log_settings(settings: AppSettings) -> None:
    logger.info("Project root: %s", settings.root)
    logger.info("Raw story root: %s", settings.raw_story_root)
    logger.info("SQLite database: %s", settings.database_path)
    logger.info(
        "Token config context_window=%d max_tokens=%d compact_threshold=%.2f safety_margin=%d",
        settings.context_window,
        settings.max_tokens,
        settings.compact_threshold,
        settings.safety_margin_tokens,
    )
    logger.info(
        "Continuity config previous=%d previous_full=%d entities=%d relationships=%d terminology=%d glossary=%d arcs=%d",
        settings.previous_chapters,
        settings.previous_full_chapters,
        settings.entity_limit,
        settings.relationship_limit,
        settings.terminology_limit,
        settings.glossary_limit,
        settings.arc_limit,
    )
    if settings.model:
        logger.info(
            "LLM config base_url=%s model=%s timeout=%ss retries=%d reasoning=%s api_key=<hidden:%d chars>",
            settings.base_url,
            settings.model,
            settings.timeout_seconds,
            settings.max_retries,
            settings.reasoning_effort or "<unset>",
            len(settings.api_key),
        )


async def _run_translate(args: argparse.Namespace, settings: AppSettings) -> int:
    source = FileSystemRawStorySource(settings.raw_story_root)
    repo = SQLiteStoryRepository(settings.database_path)
    repo.initialize()
    try:
        llm = OpenAITranslationService(settings)
        context_builder = ContextBuilder(repo, settings.context_settings())
        workflow_settings = TranslationWorkflowSettings(
            review_mode=settings.review_mode,
            strict_sequential=False if args.allow_context_gap else settings.strict_sequential,
        )
        use_case = TranslateSeries(
            source=source,
            repository=repo,
            llm=llm,
            context_builder=context_builder,
            quality_checker=TranslationQualityChecker(),
            settings=workflow_settings,
            emit=(lambda _event: None) if args.quiet else _event_printer,
        )
        summary = await use_case.execute(
            args.novel_id,
            args.lang,
            start=args.start,
            end=args.end,
            force=args.force,
            max_chapters=args.max_chapters,
        )
        print(json.dumps({
            "run_id": summary.run_id,
            "novel_id": summary.novel_id,
            "lang_id": summary.lang_id,
            "processed": list(summary.processed),
            "skipped": list(summary.skipped),
            "database": str(settings.database_path),
        }, ensure_ascii=False, indent=2))
        return 0
    finally:
        repo.close()


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    root = args.root.resolve()

    requested_level = getattr(args, "log_level", "info")
    if getattr(args, "quiet", False):
        requested_level = "error"
    configure_logging(level=requested_level, log_file=getattr(args, "log_file", None))
    logger.debug("CLI arguments: %s", vars(args))

    try:
        require_llm = args.command == "translate"
        settings = AppSettings.from_env(root, require_llm=require_llm)
        _log_settings(settings)

        if args.command == "list":
            source = FileSystemRawStorySource(settings.raw_story_root)
            for slug in source.discover_series():
                count = len(source.list_chapter_numbers(slug))
                print(f"{slug}\t{count} raw chapters")
            return 0

        repo = SQLiteStoryRepository(settings.database_path)
        try:
            repo.initialize()
            if args.command == "init-db":
                print(settings.database_path)
                return 0
            if args.command == "status":
                print(json.dumps({
                    "novel_id": args.novel_id,
                    "lang_id": args.lang,
                    "completed_chapters": repo.chapter_count(args.novel_id, args.lang),
                    "metadata_snapshot_rows": repo.metadata_counts(args.novel_id, args.lang),
                    "database": str(settings.database_path),
                }, ensure_ascii=False, indent=2))
                return 0
        finally:
            repo.close()

        if args.command == "translate":
            return asyncio.run(_run_translate(args, settings))

        if args.command == "preview":
            static_root = root / "web" / "dist"
            if not static_root.is_dir():
                logger.warning("React build not found at %s; serving API plus setup page", static_root)
            run_preview_server(
                settings.database_path,
                host=args.host,
                port=args.port,
                static_root=static_root if static_root.is_dir() else None,
            )
            return 0

        parser.error(f"Unsupported command: {args.command}")
        return 2
    except (ValueError, TranslationError, RuntimeError) as exc:
        logger.error("%s", exc)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
