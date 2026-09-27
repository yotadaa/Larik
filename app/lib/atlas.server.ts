import type { D1DatabaseLike } from "./repository.ts";
import { hrefChapter } from "./params.ts";
import type { AtlasChapterBoundary, AtlasData, AtlasEdge, AtlasEvent, AtlasKind, AtlasNode, AtlasScope } from "./atlas.ts";

interface VersionRow { version: number; coverage_note: string }
interface ChapterRow { chapter_id: string; ordinal: number; title: string; reviewed?: number }
const safeJsonStrings = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
};

async function publishedVersion(db: D1DatabaseLike, novelId: string): Promise<VersionRow | null> {
  return db.prepare(`SELECT version, coverage_note FROM story_knowledge_versions
    WHERE novel_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1`)
    .bind(novelId).first<VersionRow>();
}

async function chapterFor(db: D1DatabaseLike, novelId: string, version: number, chapterId: string) {
  return db.prepare(`SELECT chapter_id, ordinal, title, reviewed
    FROM story_chapter_sequence WHERE novel_id = ? AND version = ? AND chapter_id = ? LIMIT 1`)
    .bind(novelId, version, chapterId).first<ChapterRow>();
}

export async function listAtlasChapters(db: D1DatabaseLike, novelId: string): Promise<{ version: number; coverageNote: string; chapters: AtlasChapterBoundary[] } | null> {
  const version = await publishedVersion(db, novelId);
  if (!version) return null;
  const { results } = await db.prepare(`SELECT chapter_id, ordinal, title, reviewed
    FROM story_chapter_sequence WHERE novel_id = ? AND version = ? ORDER BY ordinal ASC`)
    .bind(novelId, version.version).all<ChapterRow>();
  return {
    version: Number(version.version),
    coverageNote: version.coverage_note,
    chapters: results.map((row) => ({
      chapterId: row.chapter_id,
      ordinal: Number(row.ordinal),
      title: row.title,
      reviewed: Number(row.reviewed ?? 0) === 1,
    })),
  };
}

export interface AtlasLoadOptions {
  fromChapterId?: string;
  throughChapterId: string;
  scope?: AtlasScope;
  includeUnreviewed?: boolean;
}

export async function loadAtlasData(db: D1DatabaseLike, novelId: string, options: AtlasLoadOptions | string): Promise<AtlasData | null> {
  const normalized: AtlasLoadOptions = typeof options === "string"
    ? { throughChapterId: options, scope: "through", includeUnreviewed: false }
    : options;
  const version = await publishedVersion(db, novelId);
  if (!version) return null;

  const throughRow = await chapterFor(db, novelId, version.version, normalized.throughChapterId);
  if (!throughRow) return null;
  const firstRow = normalized.fromChapterId
    ? await chapterFor(db, novelId, version.version, normalized.fromChapterId)
    : await db.prepare(`SELECT chapter_id, ordinal, title, reviewed FROM story_chapter_sequence
        WHERE novel_id = ? AND version = ? ORDER BY ordinal ASC LIMIT 1`)
      .bind(novelId, version.version).first<ChapterRow>();
  if (!firstRow) return null;

  const requestedOrdinal = Number(throughRow.ordinal);
  const fromOrdinal = Number(firstRow.ordinal);
  if (fromOrdinal > requestedOrdinal) return null;

  const reviewedThroughRow = await db.prepare(`SELECT chapter_id, ordinal, title, reviewed FROM story_chapter_sequence
    WHERE novel_id = ? AND version = ? AND reviewed = 1 AND ordinal <= ?
    ORDER BY ordinal DESC LIMIT 1`)
    .bind(novelId, version.version, requestedOrdinal).first<ChapterRow>();
  if (!reviewedThroughRow) return null;
  const reviewedOrdinal = Number(reviewedThroughRow.ordinal);

  const includeUnreviewed = Boolean(normalized.includeUnreviewed);
  const dataEnd = includeUnreviewed ? requestedOrdinal : reviewedOrdinal;
  const eventStart = normalized.scope === "through" ? 1 : fromOrdinal;
  const reviewClause = includeUnreviewed ? "" : " AND reviewed = 1";
  const relationReviewClause = includeUnreviewed ? "" : " AND r.reviewed = 1";

  const [nodeRows, edgeRows, eventRows] = await Promise.all([
    db.prepare(`SELECT entity_id, kind, label, description, aliases_json, first_visible_ordinal, source_chapter_id, source_label, reviewed
      FROM story_entities WHERE novel_id = ? AND version = ? AND first_visible_ordinal <= ?${reviewClause}
      ORDER BY first_visible_ordinal, kind, label COLLATE NOCASE`)
      .bind(novelId, version.version, dataEnd).all<Record<string, unknown>>(),
    db.prepare(`SELECT r.relation_id, r.source_entity_id, r.target_entity_id, r.relation_type, r.label, r.description,
      r.visible_from_ordinal, r.source_chapter_id, r.source_label, r.reviewed
      FROM story_relations r
      JOIN story_entities source ON source.novel_id = r.novel_id AND source.version = r.version AND source.entity_id = r.source_entity_id
      JOIN story_entities target ON target.novel_id = r.novel_id AND target.version = r.version AND target.entity_id = r.target_entity_id
      WHERE r.novel_id = ? AND r.version = ? AND r.visible_from_ordinal <= ?${relationReviewClause}
        AND source.first_visible_ordinal <= ? AND target.first_visible_ordinal <= ?
        ${includeUnreviewed ? "" : "AND source.reviewed = 1 AND target.reviewed = 1"}
      ORDER BY r.visible_from_ordinal, r.relation_id`)
      .bind(novelId, version.version, dataEnd, dataEnd, dataEnd).all<Record<string, unknown>>(),
    db.prepare(`SELECT event_id, chapter_ordinal, chapter_id, kind, label, summary, entity_ids_json, source_label, reviewed
      FROM story_events WHERE novel_id = ? AND version = ? AND chapter_ordinal BETWEEN ? AND ?${reviewClause}
      ORDER BY chapter_ordinal, event_id`)
      .bind(novelId, version.version, eventStart, dataEnd).all<Record<string, unknown>>(),
  ]);

  const source = (chapterId: string, label: string) => ({ chapterId, label: label || chapterId, href: hrefChapter(novelId, chapterId) });
  const nodes: AtlasNode[] = nodeRows.results.map((row) => ({
    id: String(row.entity_id),
    kind: String(row.kind) as AtlasKind,
    label: String(row.label),
    description: String(row.description ?? ""),
    aliases: safeJsonStrings(String(row.aliases_json ?? "[]")),
    visibleFrom: Number(row.first_visible_ordinal),
    source: source(String(row.source_chapter_id), String(row.source_label ?? "")),
    reviewed: Number(row.reviewed) === 1,
  }));
  const edges: AtlasEdge[] = edgeRows.results.map((row) => ({
    id: String(row.relation_id), source: String(row.source_entity_id), target: String(row.target_entity_id),
    relation: String(row.relation_type), label: String(row.label), evidence: String(row.description ?? ""),
    visibleFrom: Number(row.visible_from_ordinal), sourceRef: source(String(row.source_chapter_id), String(row.source_label ?? "")),
    reviewed: Number(row.reviewed) === 1,
  }));
  const events: AtlasEvent[] = eventRows.results.map((row) => ({
    id: String(row.event_id), chapterOrdinal: Number(row.chapter_ordinal), chapterId: String(row.chapter_id),
    kind: String(row.kind), label: String(row.label), summary: String(row.summary),
    entityIds: safeJsonStrings(String(row.entity_ids_json ?? "[]")),
    source: source(String(row.chapter_id), String(row.source_label ?? "")), reviewed: Number(row.reviewed) === 1,
  }));
  const from: AtlasChapterBoundary = {
    chapterId: firstRow.chapter_id,
    ordinal: fromOrdinal,
    title: firstRow.title,
    reviewed: Number(firstRow.reviewed ?? 0) === 1,
  };
  const through: AtlasChapterBoundary = {
    chapterId: throughRow.chapter_id,
    ordinal: requestedOrdinal,
    title: throughRow.title,
    reviewed: Number(throughRow.reviewed ?? 0) === 1,
  };
  const reviewedThrough: AtlasChapterBoundary = {
    chapterId: reviewedThroughRow.chapter_id,
    ordinal: reviewedOrdinal,
    title: reviewedThroughRow.title,
    reviewed: true,
  };
  return {
    novelId,
    version: Number(version.version),
    coverageNote: version.coverage_note,
    scope: normalized.scope ?? "through",
    from,
    through,
    reviewedThrough,
    coverageLimited: requestedOrdinal > reviewedOrdinal,
    unreviewedUnlocked: includeUnreviewed && requestedOrdinal > reviewedOrdinal,
    nodes,
    edges,
    events,
  };
}

/** Inline lookup intentionally remains review-only; reading a later chapter never auto-unlocks metadata spoilers. */
export async function loadInlineLookup(db: D1DatabaseLike, novelId: string, chapterId: string) {
  const atlas = await loadAtlasData(db, novelId, { throughChapterId: chapterId, scope: "through", includeUnreviewed: false });
  if (!atlas) return null;
  return {
    version: atlas.version,
    through: atlas.through,
    reviewedThrough: atlas.reviewedThrough,
    coverageLimited: atlas.coverageLimited,
    coverageNote: atlas.coverageNote,
    entries: atlas.nodes,
  };
}
