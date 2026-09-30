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
  /** Route-safe identity. It includes language so the same novel can have multiple translations. */
  novelId: string;
  sourceNovelId: string;
  lang: string;
  chapterCount: number;
}

export interface NovelIdentity {
  routeNovelId: string;
  novelId: string;
  langId: string;
}

export interface ChapterSummary {
  id: number;
  chapterId: string;
  title: string;
  recapAvailable: boolean;
  excerpt?: string;
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

const NOVEL_KEY_SEPARATOR = "::";

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

function humanizeNovelId(novelId: string) {
  const value = novelId.replace(/[-_]+/g, " ").trim();
  if (!value) return novelId;
  return value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function makeRouteNovelId(novelId: string, langId: string) {
  return `${novelId}${NOVEL_KEY_SEPARATOR}${langId}`;
}

function splitRouteNovelId(routeNovelId: string): { novelId: string; langId: string } | null {
  const at = routeNovelId.lastIndexOf(NOVEL_KEY_SEPARATOR);
  if (at <= 0 || at >= routeNovelId.length - NOVEL_KEY_SEPARATOR.length) return null;
  return {
    novelId: routeNovelId.slice(0, at),
    langId: routeNovelId.slice(at + NOVEL_KEY_SEPARATOR.length),
  };
}

export async function resolveNovelIdentity(db: D1DatabaseLike, routeNovelId: string): Promise<NovelIdentity | null> {
  const explicit = splitRouteNovelId(routeNovelId);
  if (explicit) {
    const row = await db.prepare(`
      SELECT 1 AS ok
      FROM chapters
      WHERE novel_id = ? AND lang_id = ? AND stale = 0 AND status = 'completed'
      LIMIT 1
    `).bind(explicit.novelId, explicit.langId).first<Record<string, unknown>>();
    return row ? { routeNovelId: makeRouteNovelId(explicit.novelId, explicit.langId), ...explicit } : null;
  }

  const preferred = process.env.DEFAULT_LANG_ID?.trim() || "id";
  const row = await db.prepare(`
    SELECT novel_id, lang_id
    FROM chapters
    WHERE novel_id = ? AND stale = 0 AND status = 'completed'
    GROUP BY novel_id, lang_id
    ORDER BY CASE WHEN lang_id = ? THEN 0 ELSE 1 END, lang_id COLLATE NOCASE ASC
    LIMIT 1
  `).bind(routeNovelId, preferred).first<Record<string, unknown>>();
  if (!row) return null;
  const novelId = text(row.novel_id);
  const langId = text(row.lang_id);
  return { routeNovelId: makeRouteNovelId(novelId, langId), novelId, langId };
}

export async function listLanguages(db: D1DatabaseLike): Promise<Array<{ lang: string; count: number }>> {
  const { results } = await db.prepare(`
    SELECT lang_id AS lang, COUNT(DISTINCT novel_id) AS count
    FROM chapters
    WHERE stale = 0 AND status = 'completed'
    GROUP BY lang_id
    ORDER BY lang_id COLLATE NOCASE ASC
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
  const where = `
    WHERE stale = 0 AND status = 'completed'
      AND (? = '' OR instr(lower(novel_id), lower(?)) > 0)
      AND (? = '' OR lang_id = ?)
  `;

  const countRow = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM (
      SELECT novel_id, lang_id
      FROM chapters
      ${where}
      GROUP BY novel_id, lang_id
    ) grouped
  `).bind(q, q, lang, lang).first<Record<string, unknown>>();

  const { results } = await db.prepare(`
    SELECT novel_id, lang_id, COUNT(*) AS chapter_count, MIN(chapter_number) AS first_chapter
    FROM chapters
    ${where}
    GROUP BY novel_id, lang_id
    ORDER BY novel_id COLLATE NOCASE ASC, lang_id COLLATE NOCASE ASC
    LIMIT ? OFFSET ?
  `).bind(q, q, lang, lang, pageSize, offset).all<Record<string, unknown>>();

  const items = results.map((row, index) => {
    const sourceNovelId = text(row.novel_id);
    const langId = text(row.lang_id);
    return {
      id: offset + index + 1,
      title: humanizeNovelId(sourceNovelId),
      novelId: makeRouteNovelId(sourceNovelId, langId),
      sourceNovelId,
      lang: langId,
      chapterCount: integer(row.chapter_count),
    };
  });
  return pageResult(items, integer(countRow?.total), page, pageSize);
}

export async function getNovel(db: D1DatabaseLike, routeNovelId: string): Promise<NovelSummary | null> {
  const identity = await resolveNovelIdentity(db, routeNovelId);
  if (!identity) return null;
  const row = await db.prepare(`
    SELECT COUNT(*) AS chapter_count, MIN(chapter_number) AS first_chapter
    FROM chapters
    WHERE novel_id = ? AND lang_id = ? AND stale = 0 AND status = 'completed'
  `).bind(identity.novelId, identity.langId).first<Record<string, unknown>>();
  return {
    id: integer(row?.first_chapter) || 1,
    title: humanizeNovelId(identity.novelId),
    novelId: identity.routeNovelId,
    sourceNovelId: identity.novelId,
    lang: identity.langId,
    chapterCount: integer(row?.chapter_count),
  };
}

export async function listChapters(
  db: D1DatabaseLike,
  routeNovelId: string,
  options: { q?: string; page?: number; pageSize?: number } = {},
): Promise<Paged<ChapterSummary>> {
  const identity = await resolveNovelIdentity(db, routeNovelId);
  const q = (options.q ?? "").trim();
  const { page, pageSize, offset } = normalizedPage(options.page ?? 1, options.pageSize ?? 50);
  if (!identity) return pageResult([], 0, page, pageSize);

  const search = `
    AND (? = '' OR instr(lower(COALESCE(chapter_title, '')), lower(?)) > 0
                 OR instr(lower(translated_text), lower(?)) > 0
                 OR CAST(chapter_number AS TEXT) = ?)
  `;
  const countRow = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM chapters
    WHERE novel_id = ? AND lang_id = ? AND stale = 0 AND status = 'completed'
    ${search}
  `).bind(identity.novelId, identity.langId, q, q, q, q).first<Record<string, unknown>>();

  const { results } = await db.prepare(`
    SELECT chapter_number, chapter_title, continuity_summary,
           CASE WHEN ? <> '' THEN substr(replace(replace(translated_text, char(10), ' '), char(13), ' '), 1, 220) ELSE '' END AS excerpt
    FROM chapters
    WHERE novel_id = ? AND lang_id = ? AND stale = 0 AND status = 'completed'
    ${search}
    ORDER BY chapter_number ASC
    LIMIT ? OFFSET ?
  `).bind(q, identity.novelId, identity.langId, q, q, q, q, pageSize, offset).all<Record<string, unknown>>();

  const items = results.map((row) => {
    const chapterNumber = integer(row.chapter_number);
    return {
      id: chapterNumber,
      chapterId: String(chapterNumber),
      title: text(row.chapter_title) || `Chapter ${chapterNumber}`,
      recapAvailable: text(row.continuity_summary).trim().length > 0,
      excerpt: text(row.excerpt) || undefined,
    };
  });
  return pageResult(items, integer(countRow?.total), page, pageSize);
}

async function adjacentChapter(
  db: D1DatabaseLike,
  identity: NovelIdentity,
  chapterNumber: number,
  direction: "previous" | "next",
): Promise<ChapterSummary | null> {
  const operator = direction === "previous" ? "<" : ">";
  const order = direction === "previous" ? "DESC" : "ASC";
  const row = await db.prepare(`
    SELECT chapter_number, chapter_title, continuity_summary
    FROM chapters
    WHERE novel_id = ? AND lang_id = ? AND stale = 0 AND status = 'completed'
      AND chapter_number ${operator} ?
    ORDER BY chapter_number ${order}
    LIMIT 1
  `).bind(identity.novelId, identity.langId, chapterNumber).first<Record<string, unknown>>();
  if (!row) return null;
  const number = integer(row.chapter_number);
  return {
    id: number,
    chapterId: String(number),
    title: text(row.chapter_title) || `Chapter ${number}`,
    recapAvailable: text(row.continuity_summary).trim().length > 0,
  };
}

export async function getChapter(db: D1DatabaseLike, routeNovelId: string, chapterId: string): Promise<ChapterNavigation | null> {
  const identity = await resolveNovelIdentity(db, routeNovelId);
  if (!identity) return null;
  const chapterNumber = Number.parseInt(chapterId, 10);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) return null;
  const row = await db.prepare(`
    SELECT chapter_number, source_path, chapter_title, translated_text, continuity_summary
    FROM chapters
    WHERE novel_id = ? AND lang_id = ? AND chapter_number = ?
      AND stale = 0 AND status = 'completed'
    LIMIT 1
  `).bind(identity.novelId, identity.langId, chapterNumber).first<Record<string, unknown>>();
  if (!row) return null;

  const pathValue = text(row.source_path);
  const title = text(row.chapter_title) || `Chapter ${chapterNumber}`;
  const recap = text(row.continuity_summary);
  const [previous, next] = await Promise.all([
    adjacentChapter(db, identity, chapterNumber, "previous"),
    adjacentChapter(db, identity, chapterNumber, "next"),
  ]);
  return {
    current: {
      id: chapterNumber,
      path: pathValue,
      name: pathValue.split(/[\\/]/).pop() || `chapter-${chapterNumber}`,
      type: "chapter",
      lang: identity.langId,
      novelId: identity.routeNovelId,
      novelTitle: humanizeNovelId(identity.novelId),
      content: text(row.translated_text),
      chapterId: String(chapterNumber),
      title,
      recap,
      recapAvailable: recap.trim().length > 0,
    },
    previous,
    next,
  };
}

const latestEntityCte = `
  WITH valid_entities AS (
    SELECT e.rowid AS source_rowid, e.*
    FROM entities e
    JOIN chapters c
      ON c.novel_id = e.novel_id AND c.lang_id = e.lang_id AND c.chapter_number = e.chapter_number
    WHERE e.novel_id = ? AND e.lang_id = ? AND c.stale = 0 AND c.status = 'completed'
  ), latest AS (
    SELECT entity_id, MAX(chapter_number) AS chapter_number
    FROM valid_entities
    GROUP BY entity_id
  )
`;

export async function listCharacters(db: D1DatabaseLike, routeNovelId: string, q = ""): Promise<CharacterRecord[]> {
  const identity = await resolveNovelIdentity(db, routeNovelId);
  if (!identity) return [];
  const query = q.trim();
  const { results } = await db.prepare(`${latestEntityCte}
    SELECT e.source_rowid AS id, e.canonical_name AS name,
           CASE WHEN trim(e.description) <> '' THEN e.description
                WHEN e.characteristics_json <> '{}' THEN e.characteristics_json
                ELSE '' END AS description
    FROM valid_entities e
    JOIN latest l ON l.entity_id = e.entity_id AND l.chapter_number = e.chapter_number
    WHERE lower(e.entity_type) = 'character'
      AND (? = '' OR instr(lower(e.canonical_name), lower(?)) > 0
                   OR instr(lower(e.source_name), lower(?)) > 0
                   OR instr(lower(e.description), lower(?)) > 0)
    ORDER BY e.canonical_name COLLATE NOCASE ASC
  `).bind(identity.novelId, identity.langId, query, query, query, query).all<Record<string, unknown>>();
  return results.map((row) => ({ id: integer(row.id), name: text(row.name), description: text(row.description) }));
}

export async function listGlossary(db: D1DatabaseLike, routeNovelId: string, q = ""): Promise<GlossaryRecord[]> {
  const identity = await resolveNovelIdentity(db, routeNovelId);
  if (!identity) return [];
  const query = q.trim();
  const { results } = await db.prepare(`
    WITH valid AS (
      SELECT g.rowid AS source_rowid, g.*
      FROM glossary g
      JOIN chapters c ON c.novel_id = g.novel_id AND c.lang_id = g.lang_id AND c.chapter_number = g.chapter_number
      WHERE g.novel_id = ? AND g.lang_id = ? AND c.stale = 0 AND c.status = 'completed'
    ), latest AS (
      SELECT glossary_id, MAX(chapter_number) AS chapter_number FROM valid GROUP BY glossary_id
    )
    SELECT g.source_rowid AS id, g.term, g.definition, g.category, g.chapter_number, g.notes
    FROM valid g JOIN latest l ON l.glossary_id = g.glossary_id AND l.chapter_number = g.chapter_number
    WHERE (? = '' OR instr(lower(g.term), lower(?)) > 0
                 OR instr(lower(g.definition), lower(?)) > 0
                 OR instr(lower(g.notes), lower(?)) > 0)
    ORDER BY g.term COLLATE NOCASE ASC
  `).bind(identity.novelId, identity.langId, query, query, query, query).all<Record<string, unknown>>();
  return results.map((row) => ({
    id: integer(row.id),
    sourceTerm: text(row.term),
    canonicalTranslation: text(row.definition),
    type: text(row.category),
    firstSeen: `Chapter ${integer(row.chapter_number)}`,
    notes: text(row.notes),
  }));
}

export async function listLocations(db: D1DatabaseLike, routeNovelId: string, q = ""): Promise<TextRecord[]> {
  const identity = await resolveNovelIdentity(db, routeNovelId);
  if (!identity) return [];
  const query = q.trim();
  const { results } = await db.prepare(`${latestEntityCte}
    SELECT e.source_rowid AS id, e.canonical_name, e.description
    FROM valid_entities e JOIN latest l ON l.entity_id = e.entity_id AND l.chapter_number = e.chapter_number
    WHERE lower(e.entity_type) = 'location'
      AND (? = '' OR instr(lower(e.canonical_name), lower(?)) > 0 OR instr(lower(e.description), lower(?)) > 0)
    ORDER BY e.canonical_name COLLATE NOCASE ASC
  `).bind(identity.novelId, identity.langId, query, query, query).all<Record<string, unknown>>();
  return results.map((row) => ({
    id: integer(row.id),
    text: text(row.description).trim() ? `${text(row.canonical_name)} — ${text(row.description)}` : text(row.canonical_name),
  }));
}

export async function listTerminologies(db: D1DatabaseLike, routeNovelId: string, q = ""): Promise<TextRecord[]> {
  const identity = await resolveNovelIdentity(db, routeNovelId);
  if (!identity) return [];
  const query = q.trim();
  const { results } = await db.prepare(`
    WITH valid AS (
      SELECT t.rowid AS source_rowid, t.* FROM terminology t
      JOIN chapters c ON c.novel_id = t.novel_id AND c.lang_id = t.lang_id AND c.chapter_number = t.chapter_number
      WHERE t.novel_id = ? AND t.lang_id = ? AND c.stale = 0 AND c.status = 'completed'
    ), latest AS (
      SELECT term_id, MAX(chapter_number) AS chapter_number FROM valid GROUP BY term_id
    )
    SELECT t.source_rowid AS id, t.source_term, t.canonical_term, t.description, t.translation_rule
    FROM valid t JOIN latest l ON l.term_id = t.term_id AND l.chapter_number = t.chapter_number
    WHERE (? = '' OR instr(lower(t.source_term), lower(?)) > 0
                 OR instr(lower(t.canonical_term), lower(?)) > 0
                 OR instr(lower(t.description), lower(?)) > 0)
    ORDER BY t.source_term COLLATE NOCASE ASC
  `).bind(identity.novelId, identity.langId, query, query, query, query).all<Record<string, unknown>>();
  return results.map((row) => ({
    id: integer(row.id),
    text: `${text(row.source_term)} — ${text(row.canonical_term)}${text(row.description).trim() ? `: ${text(row.description)}` : ""}`,
  }));
}

export async function listContinuities(db: D1DatabaseLike, routeNovelId: string, q = ""): Promise<TextRecord[]> {
  const identity = await resolveNovelIdentity(db, routeNovelId);
  if (!identity) return [];
  const query = q.trim();
  const { results } = await db.prepare(`
    SELECT chapter_number AS id, continuity_summary
    FROM chapters
    WHERE novel_id = ? AND lang_id = ? AND stale = 0 AND status = 'completed'
      AND trim(continuity_summary) <> ''
      AND (? = '' OR instr(lower(continuity_summary), lower(?)) > 0)
    ORDER BY chapter_number DESC
  `).bind(identity.novelId, identity.langId, query, query).all<Record<string, unknown>>();
  return results.map((row) => ({ id: integer(row.id), text: `Chapter ${integer(row.id)} — ${text(row.continuity_summary)}` }));
}

export async function listQaLogs(db: D1DatabaseLike, routeNovelId: string, q = ""): Promise<TextRecord[]> {
  const identity = await resolveNovelIdentity(db, routeNovelId);
  if (!identity) return [];
  const query = q.trim();
  const { results } = await db.prepare(`
    SELECT rowid AS id, run_id, status, message, start_chapter, end_chapter
    FROM translation_runs
    WHERE novel_id = ? AND lang_id = ?
      AND (? = '' OR instr(lower(run_id), lower(?)) > 0
                   OR instr(lower(status), lower(?)) > 0
                   OR instr(lower(message), lower(?)) > 0)
    ORDER BY started_at DESC
    LIMIT 250
  `).bind(identity.novelId, identity.langId, query, query, query, query).all<Record<string, unknown>>();
  return results.map((row) => ({
    id: integer(row.id),
    text: `Run ${text(row.run_id)} [${text(row.status)}] Ch. ${integer(row.start_chapter)}–${integer(row.end_chapter)}${text(row.message).trim() ? ` — ${text(row.message)}` : ""}`,
  }));
}

export async function getCatalogStats(db: D1DatabaseLike): Promise<{ novels: number; chapters: number; languages: number }> {
  const row = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM (SELECT novel_id, lang_id FROM chapters WHERE stale = 0 AND status = 'completed' GROUP BY novel_id, lang_id)) AS novels,
      (SELECT COUNT(*) FROM chapters WHERE stale = 0 AND status = 'completed') AS chapters,
      (SELECT COUNT(DISTINCT lang_id) FROM chapters WHERE stale = 0 AND status = 'completed') AS languages
  `).first<Record<string, unknown>>();
  return { novels: integer(row?.novels), chapters: integer(row?.chapters), languages: integer(row?.languages) };
}

export interface ReferenceCounts {
  characters: number;
  locations: number;
  terminology: number;
  glossary: number;
  continuity: number;
  qa: number;
}

export async function getReferenceCounts(db: D1DatabaseLike, routeNovelId: string): Promise<ReferenceCounts> {
  const identity = await resolveNovelIdentity(db, routeNovelId);
  if (!identity) return { characters: 0, locations: 0, terminology: 0, glossary: 0, continuity: 0, qa: 0 };

  const [entityRow, terminologyRow, glossaryRow, continuityRow, runRow] = await Promise.all([
    db.prepare(`${latestEntityCte}
      SELECT
        SUM(CASE WHEN lower(e.entity_type) = 'character' THEN 1 ELSE 0 END) AS characters,
        SUM(CASE WHEN lower(e.entity_type) = 'location' THEN 1 ELSE 0 END) AS locations
      FROM valid_entities e JOIN latest l ON l.entity_id = e.entity_id AND l.chapter_number = e.chapter_number
    `).bind(identity.novelId, identity.langId).first<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS count FROM (
      SELECT t.term_id FROM terminology t JOIN chapters c ON c.novel_id=t.novel_id AND c.lang_id=t.lang_id AND c.chapter_number=t.chapter_number
      WHERE t.novel_id=? AND t.lang_id=? AND c.stale=0 AND c.status='completed' GROUP BY t.term_id
    )`).bind(identity.novelId, identity.langId).first<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS count FROM (
      SELECT g.glossary_id FROM glossary g JOIN chapters c ON c.novel_id=g.novel_id AND c.lang_id=g.lang_id AND c.chapter_number=g.chapter_number
      WHERE g.novel_id=? AND g.lang_id=? AND c.stale=0 AND c.status='completed' GROUP BY g.glossary_id
    )`).bind(identity.novelId, identity.langId).first<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS count FROM chapters WHERE novel_id=? AND lang_id=? AND stale=0 AND status='completed' AND trim(continuity_summary)<>''`)
      .bind(identity.novelId, identity.langId).first<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS count FROM translation_runs WHERE novel_id=? AND lang_id=?`)
      .bind(identity.novelId, identity.langId).first<Record<string, unknown>>(),
  ]);
  return {
    characters: integer(entityRow?.characters),
    locations: integer(entityRow?.locations),
    terminology: integer(terminologyRow?.count),
    glossary: integer(glossaryRow?.count),
    continuity: integer(continuityRow?.count),
    qa: integer(runRow?.count),
  };
}
