from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from src.domains.exceptions import TranslationStoppedError
from src.infrastructures.database.db import connect


class SQLiteTranslationJobReporter:
    """Persists worker progress independently from the browser/request lifecycle."""

    def __init__(self, db_path: str | Path, job_id: str):
        self.db_path = Path(db_path)
        self.job_id = job_id
        self.conn = connect(self.db_path)

    def close(self) -> None:
        self.conn.close()

    def mark_running(self) -> None:
        with self.conn:
            self.conn.execute(
                """UPDATE translation_jobs
                   SET status='running', pid=?, current_stage='starting',
                       message='Worker process started',
                       started_at=COALESCE(started_at, CURRENT_TIMESTAMP),
                       updated_at=CURRENT_TIMESTAMP
                   WHERE job_id=? AND status IN ('queued','running')""",
                (os.getpid(), self.job_id),
            )

    def emit(self, event: dict[str, Any]) -> None:
        chapter = event.get("chapter")
        stage = str(event.get("stage") or "pipeline")
        message = str(event.get("message") or "")
        progress_current = int(event.get("progress_current") or 0)
        progress_total = int(event.get("progress_total") or 0)
        processed_delta = 1 if stage == "done" else 0
        skipped_delta = 1 if stage == "skip" else 0
        with self.conn:
            self.conn.execute(
                """INSERT INTO translation_job_events(
                       job_id,chapter_number,stage,message,progress_current,progress_total
                   ) VALUES(?,?,?,?,?,?)""",
                (self.job_id, chapter, stage, message, progress_current, progress_total),
            )
            self.conn.execute(
                """UPDATE translation_jobs
                   SET current_chapter=?, current_stage=?, progress_current=?, progress_total=?,
                       processed_count=processed_count+?, skipped_count=skipped_count+?,
                       message=?, updated_at=CURRENT_TIMESTAMP
                   WHERE job_id=?""",
                (
                    chapter,
                    stage,
                    progress_current,
                    progress_total,
                    processed_delta,
                    skipped_delta,
                    message,
                    self.job_id,
                ),
            )
        if stage not in {"completed", "failed", "stopped"} and self.should_stop():
            raise TranslationStoppedError("Translation stopped by operator")

    def should_stop(self) -> bool:
        row = self.conn.execute(
            "SELECT status FROM translation_jobs WHERE job_id=?",
            (self.job_id,),
        ).fetchone()
        return bool(row and row["status"] in {"stopping", "stopped"})

    def finish(self, status: str, message: str = "") -> None:
        normalized = status if status in {"completed", "failed", "stopped"} else "failed"
        with self.conn:
            self.conn.execute(
                """UPDATE translation_jobs
                   SET status=?, pid=NULL, current_stage=?, message=?,
                       finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
                   WHERE job_id=?""",
                (normalized, normalized, message, self.job_id),
            )
