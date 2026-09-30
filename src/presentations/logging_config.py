from __future__ import annotations

import logging
import os
import sys
from datetime import datetime
from pathlib import Path

TRACE = 5
logging.addLevelName(TRACE, "TRACE")


def _trace(self: logging.Logger, message: str, *args, **kwargs) -> None:
    if self.isEnabledFor(TRACE):
        self._log(TRACE, message, args, **kwargs)


if not hasattr(logging.Logger, "trace"):
    logging.Logger.trace = _trace  # type: ignore[attr-defined]


class CompactFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        timestamp = datetime.fromtimestamp(record.created).strftime("%H:%M:%S.%f")[:-3]
        chapter = getattr(record, "chapter", None)
        stage = getattr(record, "stage", None)
        run_id = getattr(record, "run_id", None)
        pieces = [timestamp, f"{record.levelname:<5}"]
        if chapter is not None:
            pieces.append(f"ch={int(chapter):04d}")
        if stage:
            pieces.append(f"stage={stage}")
        if run_id:
            pieces.append(f"run={str(run_id)[:8]}")
        pieces.append(record.name)
        return " | ".join(pieces) + " | " + record.getMessage()


def configure_logging(*, level: str = "trace", log_file: str | Path | None = None) -> None:
    normalized = level.strip().lower()
    levels = {
        "trace": TRACE,
        "debug": logging.DEBUG,
        "info": logging.INFO,
        "warning": logging.WARNING,
        "error": logging.ERROR,
        "critical": logging.CRITICAL,
    }
    numeric_level = levels.get(normalized, TRACE)

    root = logging.getLogger()
    root.setLevel(numeric_level)
    root.handlers.clear()

    formatter = CompactFormatter()
    console = logging.StreamHandler(sys.stderr)
    console.setLevel(numeric_level)
    console.setFormatter(formatter)
    root.addHandler(console)

    target = str(log_file or os.getenv("LARIK_LOG_FILE", "")).strip()
    if target:
        path = Path(target).expanduser().resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(path, encoding="utf-8")
        file_handler.setLevel(numeric_level)
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)
        logging.getLogger(__name__).debug("File logging enabled: %s", path)

    # SDK/network internals are noisy and may include request headers. Keep them quieter.
    for noisy in ("httpx", "httpcore", "openai._base_client"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
