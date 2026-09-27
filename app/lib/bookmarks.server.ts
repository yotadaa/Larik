import { requireUser } from "./auth.server.ts";
import { assertSameOriginPost, privateJson, readSmallForm } from "./http.server.ts";
import { validateRouteSegment } from "./params.ts";
import type { D1DatabaseLike } from "./repository.ts";

export interface BookmarkRecord {
  novelId: string; chapterId: string; novelTitle: string; chapterTitle: string;
  createdAt: number; available: boolean;
}
export interface BookmarkResult { ok?: boolean; saved?: boolean; error?: string; message?: string }

export async function isBookmarked(db: D1DatabaseLike, userId: string, novelId: string, chapterId = ""): Promise<boolean> {
  return Boolean(await db.prepare(`SELECT 1 FROM reader_bookmarks WHERE user_id = ? AND novel_id = ? AND chapter_id = ?`)
    .bind(userId, novelId, chapterId).first());
}

export async function saveBookmark(db: D1DatabaseLike, userId: string, novelId: string, chapterId = "") {
  await db.prepare(`INSERT INTO reader_bookmarks (user_id, novel_id, chapter_id, created_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(user_id, novel_id, chapter_id) DO NOTHING RETURNING novel_id`)
    .bind(userId, novelId, chapterId, Math.floor(Date.now() / 1000)).first();
}

export async function removeBookmark(db: D1DatabaseLike, userId: string, novelId: string, chapterId = "") {
  await db.prepare(`DELETE FROM reader_bookmarks WHERE user_id = ? AND novel_id = ? AND chapter_id = ? RETURNING novel_id`)
    .bind(userId, novelId, chapterId).first();
}

export async function listBookmarks(db: D1DatabaseLike, userId: string, options: { q?: string; kind?: string; page?: number } = {}) {
  const q = (options.q ?? "").trim().slice(0, 120);
  const kind = options.kind === "novel" || options.kind === "chapter" ? options.kind : "all";
  const requestedPage = Math.max(1, Math.min(100000, Math.floor(options.page ?? 1) || 1));
  const pageSize = 24;
  // Restrict by profile BEFORE resolving the newest append-only content rows.
  const cte = `WITH saved AS (
    SELECT b.*, n."novel-title" AS novel_title, nc."chapter-title" AS chapter_title,
      CASE WHEN n.id IS NOT NULL AND (b.chapter_id = '' OR nc.id IS NOT NULL) THEN 1 ELSE 0 END AS available
    FROM reader_bookmarks b
    LEFT JOIN novel n ON n.id = (SELECT MAX(id) FROM novel WHERE novel_id = b.novel_id)
    LEFT JOIN "novel-content" nc ON nc.id = (SELECT MAX(id) FROM "novel-content" WHERE "novel-id" = b.novel_id AND "chapter-id" = b.chapter_id)
    WHERE b.user_id = ?
  )`;
  const where = `WHERE (? = '' OR instr(lower(COALESCE(novel_title, novel_id)), lower(?)) > 0
    OR instr(lower(COALESCE(chapter_title, chapter_id)), lower(?)) > 0)
    AND (? = 'all' OR (? = 'novel' AND chapter_id = '') OR (? = 'chapter' AND chapter_id <> ''))`;
  const values = [userId, q, q, q, kind, kind, kind];
  const count = await db.prepare(`${cte} SELECT COUNT(*) AS total FROM saved ${where}`).bind(...values).first<{ total: number }>();
  const total = Number(count?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const { results } = await db.prepare(`${cte} SELECT * FROM saved ${where}
    ORDER BY created_at DESC, novel_id COLLATE NOCASE, chapter_id COLLATE NOCASE LIMIT ? OFFSET ?`)
    .bind(...values, pageSize, (page - 1) * pageSize).all<Record<string, unknown>>();
  return {
    items: results.map((row): BookmarkRecord => ({
      novelId: String(row.novel_id), chapterId: String(row.chapter_id),
      novelTitle: String(row.novel_title ?? row.novel_id), chapterTitle: String(row.chapter_title ?? row.chapter_id),
      createdAt: Number(row.created_at), available: Number(row.available) === 1,
    })), total, page, pageSize, totalPages, q, kind,
  };
}

export async function bookmarkAction(db: D1DatabaseLike, request: Request) {
  assertSameOriginPost(request);
  const user = await requireUser(db, request);
  const form = await readSmallForm(request);
  const intent = form.get("intent");
  if (intent !== "save" && intent !== "remove") return privateJson({ error: "Unknown bookmark operation." }, 400);
  const novelId = validateRouteSegment(typeof form.get("novelId") === "string" ? String(form.get("novelId")) : undefined, "novel id");
  const rawChapter = form.get("chapterId");
  const chapterId = rawChapter ? validateRouteSegment(String(rawChapter), "chapter id") : "";
  if (intent === "save") {
    // Validate in the same DB that supplies the reader. Never accept an arbitrary external target.
    const novel = await db.prepare('SELECT 1 FROM novel WHERE "novel_id" = ? LIMIT 1').bind(novelId).first();
    const chapter = !chapterId || await db.prepare('SELECT 1 FROM "novel-content" WHERE "novel-id" = ? AND "chapter-id" = ? LIMIT 1').bind(novelId, chapterId).first();
    if (!novel || !chapter) return privateJson({ error: "This novel or chapter is no longer available." }, 404);
    await saveBookmark(db, user.id, novelId, chapterId);
  } else {
    // An unavailable/deleted chapter's bookmark can still be removed.
    await removeBookmark(db, user.id, novelId, chapterId);
  }
  return privateJson({ ok: true, saved: intent === "save", message: intent === "save" ? "Bookmark saved." : "Bookmark removed." });
}
