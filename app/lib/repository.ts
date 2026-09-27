export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1StatementLike;
}

export interface NovelSummary {
  id: number;
  title: string;
  novelId: string;
  lang: string;
  chapterCount: number;
}

export interface ChapterSummary {
  id: number;
  chapterId: string;
  title: string;
  recapAvailable: boolean;
}

export interface ChapterRecord extends ChapterSummary {
  path: string;
  name: string;
  type: string;
  lang: string;
  novelId: string;
  novelTitle: string;
  content: string;
  recap: string;
}

export interface CharacterRecord {
  id: number;
  name: string;
  description: string;
}

export interface GlossaryRecord {
  id: number;
  sourceTerm: string;
  canonicalTranslation: string;
  type: string;
  firstSeen: string;
  notes: string;
}

export interface TextRecord {
  id: number;
  text: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ChapterNavigation {
  previous: ChapterSummary | null;
  current: ChapterRecord;
  next: ChapterSummary | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedPage(page: number, pageSize: number) {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safePageSize = Number.isInteger(pageSize) ? Math.min(Math.max(pageSize, 1), 100) : 24;
  return { page: safePage, pageSize: safePageSize, offset: (safePage - 1) * safePageSize };
}

function pageResult<T>(items: T[], total: number, page: number, pageSize: number): Paged<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listLanguages(db: D1DatabaseLike): Promise<Array<{ lang: string; count: number }>> {
  const { results } = await db.prepare(`
    WITH latest AS (
      SELECT "novel_id", MAX("id") AS latest_id
      FROM "novel"
      GROUP BY "novel_id"
    )
    SELECT COALESCE(n."lang", '') AS lang, COUNT(*) AS count
    FROM "novel" n
    JOIN latest l ON l.latest_id = n."id"
    GROUP BY COALESCE(n."lang", '')
    ORDER BY lang COLLATE NOCASE ASC
  `).all<Record<string, unknown>>();

  return results.map((row) => ({ lang: text(row.lang), count: integer(row.count) }));
}

export async function listNovels(
  db: D1DatabaseLike,
  options: { q?: string; lang?: string; page?: number; pageSize?: number } = {},
): Promise<Paged<NovelSummary>> {
  const q = (options.q ?? "").trim();
  const lang = (options.lang ?? "").trim();
  const { page, pageSize, offset } = normalizedPage(options.page ?? 1, options.pageSize ?? 24);

  const latestCte = `
    WITH latest AS (
      SELECT "novel_id", MAX("id") AS latest_id
      FROM "novel"
      GROUP BY "novel_id"
    ), chapter_counts AS (
      SELECT "novel-id" AS novel_id, COUNT(DISTINCT "chapter-id") AS chapter_count
      FROM "novel-content"
      GROUP BY "novel-id"
    )
  `;
  const where = `
    WHERE (? = '' OR instr(lower(COALESCE(n."novel-title", '')), lower(?)) > 0
                   OR instr(lower(COALESCE(n."novel_id", '')), lower(?)) > 0)
      AND (? = '' OR n."lang" = ?)
  `;

  const countRow = await db.prepare(`${latestCte}
    SELECT COUNT(*) AS total
    FROM "novel" n
    JOIN latest l ON l.latest_id = n."id"
    ${where}
  `).bind(q, q, q, lang, lang).first<Record<string, unknown>>();

  const { results } = await db.prepare(`${latestCte}
    SELECT n."id" AS id,
           COALESCE(n."novel-title", '') AS title,
           COALESCE(n."novel_id", '') AS novel_id,
           COALESCE(n."lang", '') AS lang,
           COALESCE(c.chapter_count, 0) AS chapter_count
    FROM "novel" n
    JOIN latest l ON l.latest_id = n."id"
    LEFT JOIN chapter_counts c ON c.novel_id = n."novel_id"
    ${where}
    ORDER BY n."novel-title" COLLATE NOCASE ASC, n."novel_id" COLLATE NOCASE ASC
    LIMIT ? OFFSET ?
  `).bind(q, q, q, lang, lang, pageSize, offset).all<Record<string, unknown>>();

  const items = results.map((row) => ({
    id: integer(row.id),
    title: text(row.title),
    novelId: text(row.novel_id),
    lang: text(row.lang),
    chapterCount: integer(row.chapter_count),
  }));

  return pageResult(items, integer(countRow?.total), page, pageSize);
}

export async function getNovel(db: D1DatabaseLike, novelId: string): Promise<NovelSummary | null> {
  const row = await db.prepare(`
    SELECT n."id" AS id,
           COALESCE(n."novel-title", '') AS title,
           COALESCE(n."novel_id", '') AS novel_id,
           COALESCE(n."lang", '') AS lang,
           (SELECT COUNT(DISTINCT nc."chapter-id")
              FROM "novel-content" nc
             WHERE nc."novel-id" = n."novel_id") AS chapter_count
    FROM "novel" n
    WHERE n."novel_id" = ?
    ORDER BY n."id" DESC
    LIMIT 1
  `).bind(novelId).first<Record<string, unknown>>();

  if (!row) return null;
  return {
    id: integer(row.id),
    title: text(row.title),
    novelId: text(row.novel_id),
    lang: text(row.lang),
    chapterCount: integer(row.chapter_count),
  };
}

const latestChapterCte = `
  WITH latest_chapters AS (
    SELECT "chapter-id", MAX("id") AS latest_id
    FROM "novel-content"
    WHERE "novel-id" = ?
    GROUP BY "chapter-id"
  )
`;

export async function listChapters(
  db: D1DatabaseLike,
  novelId: string,
  options: { q?: string; page?: number; pageSize?: number } = {},
): Promise<Paged<ChapterSummary>> {
  const q = (options.q ?? "").trim();
  const { page, pageSize, offset } = normalizedPage(options.page ?? 1, options.pageSize ?? 50);
  const where = `
    WHERE (? = '' OR instr(lower(COALESCE(nc."chapter-title", '')), lower(?)) > 0
                   OR instr(lower(COALESCE(nc."chapter-id", '')), lower(?)) > 0)
  `;

  const countRow = await db.prepare(`${latestChapterCte}
    SELECT COUNT(*) AS total
    FROM "novel-content" nc
    JOIN latest_chapters lc ON lc.latest_id = nc."id"
    ${where}
  `).bind(novelId, q, q, q).first<Record<string, unknown>>();

  const { results } = await db.prepare(`${latestChapterCte}
    SELECT nc."id" AS id,
           COALESCE(nc."chapter-id", '') AS chapter_id,
           COALESCE(nc."chapter-title", '') AS chapter_title,
           CASE WHEN length(trim(COALESCE(nc."recap", ''))) > 0 THEN 1 ELSE 0 END AS recap_available
    FROM "novel-content" nc
    JOIN latest_chapters lc ON lc.latest_id = nc."id"
    ${where}
    ORDER BY nc."chapter-id" COLLATE NOCASE ASC
    LIMIT ? OFFSET ?
  `).bind(novelId, q, q, q, pageSize, offset).all<Record<string, unknown>>();

  const items = results.map((row) => ({
    id: integer(row.id),
    chapterId: text(row.chapter_id),
    title: text(row.chapter_title),
    recapAvailable: integer(row.recap_available) === 1,
  }));

  return pageResult(items, integer(countRow?.total), page, pageSize);
}

async function getChapterSummaries(db: D1DatabaseLike, novelId: string): Promise<ChapterSummary[]> {
  const { results } = await db.prepare(`${latestChapterCte}
    SELECT nc."id" AS id,
           COALESCE(nc."chapter-id", '') AS chapter_id,
           COALESCE(nc."chapter-title", '') AS chapter_title,
           CASE WHEN length(trim(COALESCE(nc."recap", ''))) > 0 THEN 1 ELSE 0 END AS recap_available
    FROM "novel-content" nc
    JOIN latest_chapters lc ON lc.latest_id = nc."id"
    ORDER BY nc."chapter-id" COLLATE NOCASE ASC
  `).bind(novelId).all<Record<string, unknown>>();

  return results.map((row) => ({
    id: integer(row.id),
    chapterId: text(row.chapter_id),
    title: text(row.chapter_title),
    recapAvailable: integer(row.recap_available) === 1,
  }));
}

export async function getChapter(db: D1DatabaseLike, novelId: string, chapterId: string): Promise<ChapterNavigation | null> {
  const row = await db.prepare(`
    SELECT "id", "path", "name", "type", "lang", "novel-id" AS novel_id,
           "novel-title" AS novel_title, "content", "chapter-id" AS chapter_id,
           "chapter-title" AS chapter_title, "recap"
    FROM "novel-content"
    WHERE "novel-id" = ? AND "chapter-id" = ?
    ORDER BY "id" DESC
    LIMIT 1
  `).bind(novelId, chapterId).first<Record<string, unknown>>();

  if (!row) return null;

  const summaries = await getChapterSummaries(db, novelId);
  const index = summaries.findIndex((item) => item.chapterId === chapterId);
  const current: ChapterRecord = {
    id: integer(row.id),
    path: text(row.path),
    name: text(row.name),
    type: text(row.type),
    lang: text(row.lang),
    novelId: text(row.novel_id),
    novelTitle: text(row.novel_title),
    content: text(row.content),
    chapterId: text(row.chapter_id),
    title: text(row.chapter_title),
    recap: text(row.recap),
    recapAvailable: text(row.recap).trim().length > 0,
  };

  return {
    current,
    previous: index > 0 ? summaries[index - 1] : null,
    next: index >= 0 && index < summaries.length - 1 ? summaries[index + 1] : null,
  };
}

export async function listCharacters(db: D1DatabaseLike, novelId: string, q = ""): Promise<CharacterRecord[]> {
  const query = q.trim();
  const { results } = await db.prepare(`
    WITH latest AS (
      SELECT COALESCE("character-name", '') AS name, MAX("id") AS latest_id
      FROM "characters"
      WHERE "novel-id" = ?
      GROUP BY COALESCE("character-name", '')
    )
    SELECT c."id" AS id,
           COALESCE(c."character-name", '') AS name,
           COALESCE(c."character-description", '') AS description
    FROM "characters" c
    JOIN latest l ON l.latest_id = c."id"
    WHERE (? = '' OR instr(lower(COALESCE(c."character-name", '')), lower(?)) > 0
                   OR instr(lower(COALESCE(c."character-description", '')), lower(?)) > 0)
    ORDER BY c."character-name" COLLATE NOCASE ASC
  `).bind(novelId, query, query, query).all<Record<string, unknown>>();

  return results.map((row) => ({ id: integer(row.id), name: text(row.name), description: text(row.description) }));
}

export async function listGlossary(db: D1DatabaseLike, novelId: string, q = ""): Promise<GlossaryRecord[]> {
  const query = q.trim();
  const { results } = await db.prepare(`
    WITH latest AS (
      SELECT COALESCE("source-term", '') AS source_term, MAX("id") AS latest_id
      FROM "glossariums"
      WHERE "novel-id" = ?
      GROUP BY COALESCE("source-term", '')
    )
    SELECT g."id" AS id,
           COALESCE(g."source-term", '') AS source_term,
           COALESCE(g."canonical-translation", '') AS canonical_translation,
           COALESCE(g."type", '') AS type,
           COALESCE(g."first-seen", '') AS first_seen,
           COALESCE(g."notes", '') AS notes
    FROM "glossariums" g
    JOIN latest l ON l.latest_id = g."id"
    WHERE (? = '' OR instr(lower(COALESCE(g."source-term", '')), lower(?)) > 0
                   OR instr(lower(COALESCE(g."canonical-translation", '')), lower(?)) > 0
                   OR instr(lower(COALESCE(g."notes", '')), lower(?)) > 0)
    ORDER BY g."source-term" COLLATE NOCASE ASC
  `).bind(novelId, query, query, query, query).all<Record<string, unknown>>();

  return results.map((row) => ({
    id: integer(row.id),
    sourceTerm: text(row.source_term),
    canonicalTranslation: text(row.canonical_translation),
    type: text(row.type),
    firstSeen: text(row.first_seen),
    notes: text(row.notes),
  }));
}

async function listSingleTextColumn(
  db: D1DatabaseLike,
  table: "locations" | "terminologies" | "continuities" | "qa-log",
  column: "location" | "term" | "content" | "log",
  novelId: string,
  q = "",
): Promise<TextRecord[]> {
  const query = q.trim();
  // Table and column names are fixed by the function union above; no user-controlled identifier enters SQL.
  const { results } = await db.prepare(`
    SELECT MAX("id") AS id, COALESCE("${column}", '') AS value
    FROM "${table}"
    WHERE "novel-id" = ?
      AND (? = '' OR instr(lower(COALESCE("${column}", '')), lower(?)) > 0)
    GROUP BY COALESCE("${column}", '')
    ORDER BY value COLLATE NOCASE ASC
  `).bind(novelId, query, query).all<Record<string, unknown>>();

  return results.map((row) => ({ id: integer(row.id), text: text(row.value) }));
}

export function listLocations(db: D1DatabaseLike, novelId: string, q = "") {
  return listSingleTextColumn(db, "locations", "location", novelId, q);
}

export function listTerminologies(db: D1DatabaseLike, novelId: string, q = "") {
  return listSingleTextColumn(db, "terminologies", "term", novelId, q);
}

export function listContinuities(db: D1DatabaseLike, novelId: string, q = "") {
  return listSingleTextColumn(db, "continuities", "content", novelId, q);
}

export function listQaLogs(db: D1DatabaseLike, novelId: string, q = "") {
  return listSingleTextColumn(db, "qa-log", "log", novelId, q);
}

export async function getCatalogStats(db: D1DatabaseLike): Promise<{ novels: number; chapters: number; languages: number }> {
  const row = await db.prepare(`
    WITH latest_novels AS (
      SELECT "novel_id", MAX("id") AS latest_id
      FROM "novel"
      GROUP BY "novel_id"
    ), distinct_chapters AS (
      SELECT "novel-id", "chapter-id"
      FROM "novel-content"
      GROUP BY "novel-id", "chapter-id"
    )
    SELECT
      (SELECT COUNT(*) FROM latest_novels) AS novels,
      (SELECT COUNT(*) FROM distinct_chapters) AS chapters,
      (SELECT COUNT(DISTINCT COALESCE(n."lang", ''))
         FROM "novel" n JOIN latest_novels l ON l.latest_id = n."id") AS languages
  `).first<Record<string, unknown>>();
  return {
    novels: integer(row?.novels),
    chapters: integer(row?.chapters),
    languages: integer(row?.languages),
  };
}

export interface ReferenceCounts {
  characters: number;
  locations: number;
  terminology: number;
  glossary: number;
  continuity: number;
  qa: number;
}

export async function getReferenceCounts(db: D1DatabaseLike, novelId: string): Promise<ReferenceCounts> {
  const row = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM "characters" WHERE "novel-id" = ?) AS characters,
      (SELECT COUNT(*) FROM "locations" WHERE "novel-id" = ?) AS locations,
      (SELECT COUNT(*) FROM "terminologies" WHERE "novel-id" = ?) AS terminology,
      (SELECT COUNT(*) FROM "glossariums" WHERE "novel-id" = ?) AS glossary,
      (SELECT COUNT(*) FROM "continuities" WHERE "novel-id" = ?) AS continuity,
      (SELECT COUNT(*) FROM "qa-log" WHERE "novel-id" = ?) AS qa
  `).bind(novelId, novelId, novelId, novelId, novelId, novelId).first<Record<string, unknown>>();

  return {
    characters: integer(row?.characters),
    locations: integer(row?.locations),
    terminology: integer(row?.terminology),
    glossary: integer(row?.glossary),
    continuity: integer(row?.continuity),
    qa: integer(row?.qa),
  };
}
