import type { D1DatabaseLike } from "./repository.ts";
import { requireUser } from "./auth.server.ts";
import { assertSameOriginPost, privateJson, readSmallForm } from "./http.server.ts";

export type ShelfStatus = "planned" | "reading" | "paused" | "finished";
export interface ReaderLibraryState {
  status: ShelfStatus;
  lastChapterId: string;
  progressPercent: number;
  progressSyncCount: number;
  resumeOpenCount: number;
  lastResumedAt: number | null;
  updatedAt: number;
}

export async function getReaderLibraryState(db: D1DatabaseLike, userId: string, novelId: string): Promise<ReaderLibraryState | null> {
  const row = await db.prepare(`SELECT status, last_chapter_id, progress_percent, progress_sync_count,
      resume_open_count, last_resumed_at, updated_at
    FROM reader_library_state WHERE user_id = ? AND novel_id = ? LIMIT 1`)
    .bind(userId, novelId).first<{
      status: ShelfStatus;
      last_chapter_id: string;
      progress_percent: number;
      progress_sync_count: number;
      resume_open_count: number;
      last_resumed_at: number | null;
      updated_at: number;
    }>();
  return row ? {
    status: row.status,
    lastChapterId: row.last_chapter_id,
    progressPercent: Number(row.progress_percent) || 0,
    progressSyncCount: Number(row.progress_sync_count) || 0,
    resumeOpenCount: Number(row.resume_open_count) || 0,
    lastResumedAt: row.last_resumed_at === null ? null : Number(row.last_resumed_at),
    updatedAt: Number(row.updated_at) || 0,
  } : null;
}

async function novelExists(db: D1DatabaseLike, novelId: string) {
  return Boolean(await db.prepare(`SELECT 1 AS ok FROM "novel" WHERE "novel_id" = ? LIMIT 1`).bind(novelId).first());
}
async function chapterExists(db: D1DatabaseLike, novelId: string, chapterId: string) {
  return Boolean(await db.prepare(`SELECT 1 AS ok FROM "novel-content" WHERE "novel-id" = ? AND "chapter-id" = ? LIMIT 1`).bind(novelId, chapterId).first());
}

export async function readerStateAction(db: D1DatabaseLike, request: Request) {
  assertSameOriginPost(request);
  const user = await requireUser(db, request);
  const form = await readSmallForm(request);
  const intent = form.get("intent");
  const novelId = typeof form.get("novelId") === "string" ? String(form.get("novelId")) : "";
  if (!novelId || novelId.length > 240 || !(await novelExists(db, novelId))) return privateJson({ error: "Novel not found." }, 404);
  const now = Math.floor(Date.now() / 1000);

  if (intent === "progress") {
    const chapterId = typeof form.get("chapterId") === "string" ? String(form.get("chapterId")) : "";
    const percent = Number(form.get("percent"));
    if (!chapterId || chapterId.length > 240 || !Number.isInteger(percent) || percent < 0 || percent > 100 || !(await chapterExists(db, novelId, chapterId))) {
      return privateJson({ error: "Invalid reading progress." }, 400);
    }
    await db.prepare(`
      INSERT INTO reader_library_state
        (user_id, novel_id, status, last_chapter_id, progress_percent, progress_sync_count, resume_open_count, last_resumed_at, updated_at)
      VALUES (?, ?, 'reading', ?, ?, 1, 0, NULL, ?)
      ON CONFLICT(user_id, novel_id) DO UPDATE SET
        last_chapter_id = excluded.last_chapter_id,
        progress_percent = excluded.progress_percent,
        progress_sync_count = reader_library_state.progress_sync_count + 1,
        updated_at = excluded.updated_at,
        status = CASE WHEN reader_library_state.status = 'finished' THEN 'finished' ELSE 'reading' END
      RETURNING user_id
    `).bind(user.id, novelId, chapterId, percent, now).first();
    return privateJson({ ok: true, percent });
  }

  if (intent === "resume-open") {
    const chapterId = typeof form.get("chapterId") === "string" ? String(form.get("chapterId")) : "";
    const state = await getReaderLibraryState(db, user.id, novelId);
    if (!chapterId || !state || state.lastChapterId !== chapterId || !(await chapterExists(db, novelId, chapterId))) {
      return privateJson({ error: "Resume target does not match saved progress." }, 409);
    }
    await db.prepare(`UPDATE reader_library_state
      SET resume_open_count = resume_open_count + 1, last_resumed_at = ?, updated_at = ?
      WHERE user_id = ? AND novel_id = ? RETURNING user_id`)
      .bind(now, now, user.id, novelId).first();
    return privateJson({ ok: true });
  }

  if (intent === "status") {
    const status = form.get("status");
    if (status !== "planned" && status !== "reading" && status !== "paused" && status !== "finished") return privateJson({ error: "Invalid shelf status." }, 400);
    await db.prepare(`
      INSERT INTO reader_library_state
        (user_id, novel_id, status, last_chapter_id, progress_percent, progress_sync_count, resume_open_count, last_resumed_at, updated_at)
      VALUES (?, ?, ?, '', 0, 0, 0, NULL, ?)
      ON CONFLICT(user_id, novel_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
      RETURNING user_id
    `).bind(user.id, novelId, status, now).first();
    return privateJson({ ok: true, status });
  }
  return privateJson({ error: "Unknown reader-state operation." }, 400);
}
