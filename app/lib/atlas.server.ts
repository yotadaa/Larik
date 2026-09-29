import type { D1DatabaseLike } from "./repository.ts";
import { hrefChapter } from "./params.ts";
import {
  atlasKindFromMetadata,
  type AtlasArc,
  type AtlasChapterBoundary,
  type AtlasCharacteristic,
  type AtlasCycle,
  type AtlasData,
  type AtlasEdge,
  type AtlasEvent,
  type AtlasFact,
  type AtlasNode,
  type AtlasScene,
  type AtlasScope,
  type AtlasState,
} from "./atlas.ts";

interface VersionRow { version: number; coverage_note: string }
interface SyncRow { version: number; source_hash: string; coverage_note: string; reviewed_through: number; issue_count: number }
interface ChapterRow { chapter_id: string; ordinal: number; title: string; reviewed?: number }

const safeJsonStrings = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
};

const chapterOrdinalFromId = (chapterId: string) => Number.parseInt(chapterId.match(/^\d+/)?.[0] ?? "0", 10) || 0;
const sourceRef = (novelId: string, chapterId: string, label = "") => ({
  chapterId,
  href: chapterId ? hrefChapter(novelId, chapterId) : "",
  label: label || (chapterId ? `Chapter ${chapterOrdinalFromId(chapterId)}` : "Stored metadata"),
});

async function latestMetadataSync(db: D1DatabaseLike, novelId: string): Promise<SyncRow | null> {
  try {
    return await db.prepare(`SELECT id AS version, source_hash, coverage_note, reviewed_through, issue_count
      FROM metadata_sync_runs WHERE novel_id = ? AND status = 'complete' ORDER BY id DESC LIMIT 1`)
      .bind(novelId).first<SyncRow>();
  } catch {
    // Compatibility for databases that have not applied metadata-v2 yet.
    return null;
  }
}

async function canonicalChapterFor(db: D1DatabaseLike, novelId: string, snapshotId: string, chapterId: string) {
  return db.prepare(`SELECT chapter_id, chapter_number AS ordinal, title,
      CASE WHEN metadata_status = 'reviewed' THEN 1 ELSE 0 END AS reviewed
    FROM metadata_chapters WHERE novel_id = ? AND snapshot_id = ? AND content_exists = 1 AND chapter_id = ? LIMIT 1`)
    .bind(novelId, snapshotId, chapterId).first<ChapterRow>();
}

async function listCanonicalAtlasChapters(db: D1DatabaseLike, novelId: string, sync: SyncRow) {
  const { results } = await db.prepare(`SELECT chapter_id, chapter_number AS ordinal, title,
      CASE WHEN metadata_status = 'reviewed' THEN 1 ELSE 0 END AS reviewed
    FROM metadata_chapters WHERE novel_id = ? AND snapshot_id = ? AND content_exists = 1 ORDER BY chapter_number ASC`)
    .bind(novelId, sync.source_hash).all<ChapterRow>();
  return {
    version: Number(sync.version),
    coverageNote: sync.coverage_note,
    chapters: results.map((row) => ({
      chapterId: row.chapter_id,
      ordinal: Number(row.ordinal),
      title: row.title,
      reviewed: Number(row.reviewed ?? 0) === 1,
    })),
  };
}

async function publishedVersion(db: D1DatabaseLike, novelId: string): Promise<VersionRow | null> {
  return db.prepare(`SELECT version, coverage_note FROM story_knowledge_versions
    WHERE novel_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1`)
    .bind(novelId).first<VersionRow>();
}

async function legacyChapterFor(db: D1DatabaseLike, novelId: string, version: number, chapterId: string) {
  return db.prepare(`SELECT chapter_id, ordinal, title, reviewed
    FROM story_chapter_sequence WHERE novel_id = ? AND version = ? AND chapter_id = ? LIMIT 1`)
    .bind(novelId, version, chapterId).first<ChapterRow>();
}

async function listLegacyAtlasChapters(db: D1DatabaseLike, novelId: string) {
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

export async function listAtlasChapters(db: D1DatabaseLike, novelId: string): Promise<{ version: number; coverageNote: string; chapters: AtlasChapterBoundary[] } | null> {
  const sync = await latestMetadataSync(db, novelId);
  if (sync) return listCanonicalAtlasChapters(db, novelId, sync);
  return listLegacyAtlasChapters(db, novelId);
}

export interface AtlasLoadOptions {
  fromChapterId?: string;
  throughChapterId: string;
  scope?: AtlasScope;
  includeUnreviewed?: boolean;
}

async function loadCanonicalAtlasData(db: D1DatabaseLike, novelId: string, normalized: AtlasLoadOptions, sync: SyncRow): Promise<AtlasData | null> {
  const throughRow = await canonicalChapterFor(db, novelId, sync.source_hash, normalized.throughChapterId);
  if (!throughRow) return null;
  const firstRow = normalized.fromChapterId
    ? await canonicalChapterFor(db, novelId, sync.source_hash, normalized.fromChapterId)
    : await db.prepare(`SELECT chapter_id, chapter_number AS ordinal, title,
        CASE WHEN metadata_status = 'reviewed' THEN 1 ELSE 0 END AS reviewed
      FROM metadata_chapters WHERE novel_id = ? AND snapshot_id = ? AND content_exists = 1 ORDER BY chapter_number ASC LIMIT 1`)
      .bind(novelId, sync.source_hash).first<ChapterRow>();
  if (!firstRow) return null;

  const requestedOrdinal = Number(throughRow.ordinal);
  const fromOrdinal = Number(firstRow.ordinal);
  if (fromOrdinal > requestedOrdinal) return null;
  const reviewedThroughRow = await db.prepare(`SELECT chapter_id, chapter_number AS ordinal, title, 1 AS reviewed
    FROM metadata_chapters WHERE novel_id = ? AND snapshot_id = ? AND content_exists = 1 AND metadata_status = 'reviewed' AND chapter_number <= ?
    ORDER BY chapter_number DESC LIMIT 1`).bind(novelId, sync.source_hash, requestedOrdinal).first<ChapterRow>();
  if (!reviewedThroughRow) return null;

  const reviewedOrdinal = Number(reviewedThroughRow.ordinal);
  const includeUnreviewed = Boolean(normalized.includeUnreviewed);
  const dataEnd = includeUnreviewed ? requestedOrdinal : reviewedOrdinal;
  const windowStart = normalized.scope === "through" ? 1 : fromOrdinal;
  const reviewClause = includeUnreviewed ? "" : " AND reviewed = 1";

  const [nodeRows, aliasRows, edgeRows, factRows, stateRows, eventRows, sceneRows, arcRows, cycleRows, characteristicRows, issueRows] = await Promise.all([
    db.prepare(`SELECT entity_id, entity_type, canonical_name, description, reveal_chapter, status, source_chapter_id, reviewed
      FROM metadata_entities WHERE novel_id = ? AND snapshot_id = ? AND COALESCE(reveal_chapter, first_seen_chapter, 0) <= ?${reviewClause}
      ORDER BY COALESCE(reveal_chapter, first_seen_chapter, 0), entity_type, canonical_name COLLATE NOCASE`)
      .bind(novelId, sync.source_hash, dataEnd).all<Record<string, unknown>>(),
    db.prepare(`SELECT alias, entity_id FROM metadata_aliases
      WHERE novel_id = ? AND snapshot_id = ? AND COALESCE(reveal_chapter, valid_from_chapter, 0) <= ?${reviewClause}
      ORDER BY alias COLLATE NOCASE`).bind(novelId, sync.source_hash, dataEnd).all<Record<string, unknown>>(),
    db.prepare(`SELECT r.relationship_id, r.source_entity_id, r.target_entity_id, r.relation_type, r.status, r.certainty,
        r.valid_from_chapter, r.valid_to_chapter, r.reveal_chapter, r.cycle_id, r.evidence, r.source_chapter_id, r.reviewed
      FROM metadata_relationships r
      JOIN metadata_entities source ON source.novel_id = r.novel_id AND source.snapshot_id = r.snapshot_id AND source.entity_id = r.source_entity_id
      JOIN metadata_entities target ON target.novel_id = r.novel_id AND target.snapshot_id = r.snapshot_id AND target.entity_id = r.target_entity_id
      WHERE r.novel_id = ? AND r.snapshot_id = ? AND COALESCE(r.reveal_chapter, r.valid_from_chapter, 0) <= ?${includeUnreviewed ? "" : " AND r.reviewed = 1"}
        AND COALESCE(source.reveal_chapter, source.first_seen_chapter, 0) <= ?
        AND COALESCE(target.reveal_chapter, target.first_seen_chapter, 0) <= ?
        ${includeUnreviewed ? "" : "AND source.reviewed = 1 AND target.reviewed = 1"}
      ORDER BY COALESCE(r.reveal_chapter, r.valid_from_chapter, 0), r.relationship_id`)
      .bind(novelId, sync.source_hash, dataEnd, dataEnd, dataEnd).all<Record<string, unknown>>(),
    db.prepare(`SELECT fact_id, subject_id, predicate, object_value, value_type, reveal_chapter, valid_from_chapter, valid_to_chapter,
        cycle_id, epistemic_status, source_type, source_entity_id, supersedes, contradicts, evidence, source_chapter_id, reviewed
      FROM metadata_facts WHERE novel_id = ? AND snapshot_id = ? AND COALESCE(reveal_chapter, valid_from_chapter, 0) BETWEEN ? AND ?${reviewClause}
      ORDER BY COALESCE(reveal_chapter, valid_from_chapter, 0), fact_id`)
      .bind(novelId, sync.source_hash, windowStart, dataEnd).all<Record<string, unknown>>(),
    db.prepare(`SELECT state_id, entity_id, property, value, value_type, reveal_chapter, valid_from_chapter, valid_to_chapter,
        cycle_id, certainty, evidence, source_chapter_id, reviewed
      FROM metadata_states WHERE novel_id = ? AND snapshot_id = ?
        AND COALESCE(reveal_chapter, valid_from_chapter, 0) <= ?
        AND COALESCE(valid_from_chapter, reveal_chapter, 0) <= ?
        AND COALESCE(valid_to_chapter, ?) >= ?${reviewClause}
      ORDER BY COALESCE(reveal_chapter, valid_from_chapter, 0), state_id`)
      .bind(novelId, sync.source_hash, dataEnd, dataEnd, dataEnd, windowStart).all<Record<string, unknown>>(),
    db.prepare(`SELECT event_id, chapter_number, scene_id, scene_order, cycle_id, timeline_order, event_type, summary, location_ids_json, participant_ids_json,
        cause_event_ids_json, effect_event_ids_json, certainty, evidence, source_chapter_id, reviewed FROM metadata_events
      WHERE novel_id = ? AND snapshot_id = ? AND chapter_number BETWEEN ? AND ?${reviewClause}
      ORDER BY chapter_number, COALESCE(scene_order, 9999), event_id`)
      .bind(novelId, sync.source_hash, windowStart, dataEnd).all<Record<string, unknown>>(),
    db.prepare(`SELECT scene_id, chapter_number, scene_order, cycle_id, location_ids_json, time_marker, pov_entity_id,
        participant_ids_json, event_ids_json, summary, evidence, source_chapter_id, reviewed FROM metadata_scenes
      WHERE novel_id = ? AND snapshot_id = ? AND chapter_number BETWEEN ? AND ?${reviewClause}
      ORDER BY chapter_number, COALESCE(scene_order, 9999), scene_id`)
      .bind(novelId, sync.source_hash, windowStart, dataEnd).all<Record<string, unknown>>(),
    db.prepare(`SELECT arc_id, title, parent_arc_id, start_chapter, end_chapter, reveal_chapter, cycle_ids_json, status, summary,
        key_entity_ids_json, key_event_ids_json, evidence, source_chapter_id, reviewed FROM metadata_arcs
      WHERE novel_id = ? AND snapshot_id = ? AND start_chapter <= ? AND COALESCE(end_chapter, ?) >= ? AND COALESCE(reveal_chapter, start_chapter, 0) <= ?${reviewClause}
      ORDER BY start_chapter, arc_id`).bind(novelId, sync.source_hash, dataEnd, dataEnd, windowStart, dataEnd).all<Record<string, unknown>>(),
    db.prepare(`SELECT cycle_id, cycle_number, start_chapter, end_chapter, reveal_chapter, world_start_marker, world_end_marker,
        reset_trigger, status, evidence, source_chapter_id, reviewed FROM metadata_cycles
      WHERE novel_id = ? AND snapshot_id = ? AND start_chapter <= ? AND COALESCE(end_chapter, ?) >= ? AND COALESCE(reveal_chapter, start_chapter, 0) <= ?${reviewClause}
      ORDER BY COALESCE(cycle_number, 9999), start_chapter`).bind(novelId, sync.source_hash, dataEnd, dataEnd, windowStart, dataEnd).all<Record<string, unknown>>(),
    db.prepare(`SELECT entity_id, profile_kind, entity_type, canonical_name, first_seen_chapter, profile_through_chapter,
        physical_form, temperament_or_properties, abilities_or_role, relationships_status, characteristic_as_of, scope, evidence
      FROM metadata_characteristics
      WHERE novel_id = ? AND snapshot_id = ? AND (
        (profile_kind = 'detailed' AND COALESCE(profile_through_chapter, 2147483647) <= ?) OR
        (profile_kind <> 'detailed' AND COALESCE(first_seen_chapter, 0) <= ?)
      )
      ORDER BY CASE WHEN profile_kind = 'detailed' THEN 0 ELSE 1 END, canonical_name COLLATE NOCASE`)
      .bind(novelId, sync.source_hash, dataEnd, dataEnd).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS count FROM metadata_integrity_issues WHERE novel_id = ? AND snapshot_id = ?`).bind(novelId, sync.source_hash).all<Record<string, unknown>>(),
  ]);

  const aliases = new Map<string, string[]>();
  for (const row of aliasRows.results) {
    const entityId = String(row.entity_id);
    const values = aliases.get(entityId) ?? [];
    values.push(String(row.alias));
    aliases.set(entityId, values);
  }
  const visible = (row: Record<string, unknown>, revealKey = "reveal_chapter", fallbackKey = "valid_from_chapter") => Number(row[revealKey] ?? row[fallbackKey] ?? 0);
  const nodes: AtlasNode[] = nodeRows.results.map((row) => ({
    id: String(row.entity_id),
    kind: atlasKindFromMetadata(String(row.entity_type ?? "other")),
    entityType: String(row.entity_type ?? "other"),
    label: String(row.canonical_name),
    description: String(row.description ?? ""),
    aliases: aliases.get(String(row.entity_id)) ?? [],
    visibleFrom: visible(row),
    status: String(row.status ?? ""),
    source: sourceRef(novelId, String(row.source_chapter_id ?? "")),
    reviewed: Number(row.reviewed) === 1,
  }));
  const edges: AtlasEdge[] = edgeRows.results.map((row) => ({
    id: String(row.relationship_id), source: String(row.source_entity_id), target: String(row.target_entity_id),
    relation: String(row.relation_type), label: String(row.relation_type).replaceAll("_", " "), evidence: String(row.evidence ?? ""),
    visibleFrom: visible(row), validFrom: row.valid_from_chapter == null ? null : Number(row.valid_from_chapter), validTo: row.valid_to_chapter == null ? null : Number(row.valid_to_chapter),
    cycleId: String(row.cycle_id ?? ""), status: String(row.status ?? ""), certainty: String(row.certainty ?? ""), sourceRef: sourceRef(novelId, String(row.source_chapter_id ?? "")), reviewed: Number(row.reviewed) === 1,
  }));
  const facts: AtlasFact[] = factRows.results.map((row) => ({
    id: String(row.fact_id), subjectId: String(row.subject_id), predicate: String(row.predicate), objectValue: String(row.object_value ?? ""), valueType: String(row.value_type ?? ""),
    visibleFrom: visible(row), validFrom: row.valid_from_chapter == null ? null : Number(row.valid_from_chapter), validTo: row.valid_to_chapter == null ? null : Number(row.valid_to_chapter),
    epistemicStatus: String(row.epistemic_status ?? "unknown"), sourceType: String(row.source_type ?? ""), sourceEntityId: String(row.source_entity_id ?? ""), cycleId: String(row.cycle_id ?? ""),
    supersedes: String(row.supersedes ?? ""), contradicts: String(row.contradicts ?? ""), evidence: String(row.evidence ?? ""),
    source: sourceRef(novelId, String(row.source_chapter_id ?? "")), reviewed: Number(row.reviewed) === 1,
  }));
  const states: AtlasState[] = stateRows.results.map((row) => ({
    id: String(row.state_id), entityId: String(row.entity_id), property: String(row.property), value: String(row.value ?? ""), valueType: String(row.value_type ?? ""),
    visibleFrom: visible(row), validFrom: row.valid_from_chapter == null ? null : Number(row.valid_from_chapter), validTo: row.valid_to_chapter == null ? null : Number(row.valid_to_chapter),
    cycleId: String(row.cycle_id ?? ""), certainty: String(row.certainty ?? ""), evidence: String(row.evidence ?? ""), source: sourceRef(novelId, String(row.source_chapter_id ?? "")), reviewed: Number(row.reviewed) === 1,
  }));
  const events: AtlasEvent[] = eventRows.results.map((row) => ({
    id: String(row.event_id), chapterOrdinal: Number(row.chapter_number), chapterId: String(row.source_chapter_id ?? ""), sceneId: String(row.scene_id ?? ""), sceneOrder: row.scene_order == null ? null : Number(row.scene_order),
    cycleId: String(row.cycle_id ?? ""), kind: String(row.event_type ?? "event"), label: String(row.event_type ?? "event").replaceAll("_", " "), summary: String(row.summary ?? ""),
    timelineOrder: String(row.timeline_order ?? ""), locationIds: safeJsonStrings(String(row.location_ids_json ?? "[]")), entityIds: safeJsonStrings(String(row.participant_ids_json ?? "[]")),
    causeEventIds: safeJsonStrings(String(row.cause_event_ids_json ?? "[]")), effectEventIds: safeJsonStrings(String(row.effect_event_ids_json ?? "[]")),
    certainty: String(row.certainty ?? ""), evidence: String(row.evidence ?? ""), source: sourceRef(novelId, String(row.source_chapter_id ?? "")), reviewed: Number(row.reviewed) === 1,
  }));
  const scenes: AtlasScene[] = sceneRows.results.map((row) => ({
    id: String(row.scene_id), chapterOrdinal: Number(row.chapter_number), sceneOrder: row.scene_order == null ? null : Number(row.scene_order), cycleId: String(row.cycle_id ?? ""),
    locationIds: safeJsonStrings(String(row.location_ids_json ?? "[]")), timeMarker: String(row.time_marker ?? ""), povEntityId: String(row.pov_entity_id ?? ""),
    participantIds: safeJsonStrings(String(row.participant_ids_json ?? "[]")), eventIds: safeJsonStrings(String(row.event_ids_json ?? "[]")), summary: String(row.summary ?? ""),
    evidence: String(row.evidence ?? ""), source: sourceRef(novelId, String(row.source_chapter_id ?? "")), reviewed: Number(row.reviewed) === 1,
  }));
  const arcs: AtlasArc[] = arcRows.results.map((row) => ({
    id: String(row.arc_id), title: String(row.title), parentArcId: String(row.parent_arc_id ?? ""), startChapter: Number(row.start_chapter ?? 0), endChapter: row.end_chapter == null ? null : Number(row.end_chapter),
    visibleFrom: visible(row), cycleIds: safeJsonStrings(String(row.cycle_ids_json ?? "[]")), status: String(row.status ?? ""), summary: String(row.summary ?? ""),
    keyEntityIds: safeJsonStrings(String(row.key_entity_ids_json ?? "[]")), keyEventIds: safeJsonStrings(String(row.key_event_ids_json ?? "[]")), evidence: String(row.evidence ?? ""), source: sourceRef(novelId, String(row.source_chapter_id ?? "")), reviewed: Number(row.reviewed) === 1,
  }));
  const cycles: AtlasCycle[] = cycleRows.results.map((row) => ({
    id: String(row.cycle_id), number: row.cycle_number == null ? null : Number(row.cycle_number), startChapter: Number(row.start_chapter ?? 0), endChapter: row.end_chapter == null ? null : Number(row.end_chapter),
    visibleFrom: visible(row), worldStartMarker: String(row.world_start_marker ?? ""), worldEndMarker: String(row.world_end_marker ?? ""), resetTrigger: String(row.reset_trigger ?? ""),
    status: String(row.status ?? ""), evidence: String(row.evidence ?? ""), source: sourceRef(novelId, String(row.source_chapter_id ?? "")), reviewed: Number(row.reviewed) === 1,
  }));
  const characteristics: AtlasCharacteristic[] = characteristicRows.results.map((row) => {
    const firstSeen = row.first_seen_chapter == null ? null : Number(row.first_seen_chapter);
    const profileThrough = row.profile_through_chapter == null ? firstSeen : Number(row.profile_through_chapter);
    return {
      entityId: String(row.entity_id), profileKind: String(row.profile_kind ?? "registry"), entityType: String(row.entity_type ?? ""),
      canonicalName: String(row.canonical_name ?? ""), firstSeen, profileThrough, physicalForm: String(row.physical_form ?? ""),
      temperamentOrProperties: String(row.temperament_or_properties ?? ""), abilitiesOrRole: String(row.abilities_or_role ?? ""),
      relationshipsStatus: String(row.relationships_status ?? ""), characteristicAsOf: String(row.characteristic_as_of ?? ""),
      scope: String(row.scope ?? ""), evidence: String(row.evidence ?? ""), reviewed: (profileThrough ?? firstSeen ?? 0) <= reviewedOrdinal,
    };
  });

  const from: AtlasChapterBoundary = { chapterId: firstRow.chapter_id, ordinal: fromOrdinal, title: firstRow.title, reviewed: Number(firstRow.reviewed ?? 0) === 1 };
  const through: AtlasChapterBoundary = { chapterId: throughRow.chapter_id, ordinal: requestedOrdinal, title: throughRow.title, reviewed: Number(throughRow.reviewed ?? 0) === 1 };
  const reviewedThrough: AtlasChapterBoundary = { chapterId: reviewedThroughRow.chapter_id, ordinal: reviewedOrdinal, title: reviewedThroughRow.title, reviewed: true };
  return {
    novelId, version: Number(sync.version), coverageNote: sync.coverage_note, scope: normalized.scope ?? "through", from, through, reviewedThrough,
    coverageLimited: requestedOrdinal > reviewedOrdinal, unreviewedUnlocked: includeUnreviewed && requestedOrdinal > reviewedOrdinal,
    nodes, edges, facts, states, events, scenes, arcs, cycles, characteristics,
    integrityIssueCount: Number(issueRows.results[0]?.count ?? sync.issue_count ?? 0),
  };
}

async function loadLegacyAtlasData(db: D1DatabaseLike, novelId: string, normalized: AtlasLoadOptions): Promise<AtlasData | null> {
  const version = await publishedVersion(db, novelId);
  if (!version) return null;
  const throughRow = await legacyChapterFor(db, novelId, version.version, normalized.throughChapterId);
  if (!throughRow) return null;
  const firstRow = normalized.fromChapterId
    ? await legacyChapterFor(db, novelId, version.version, normalized.fromChapterId)
    : await db.prepare(`SELECT chapter_id, ordinal, title, reviewed FROM story_chapter_sequence
        WHERE novel_id = ? AND version = ? ORDER BY ordinal ASC LIMIT 1`).bind(novelId, version.version).first<ChapterRow>();
  if (!firstRow) return null;
  const requestedOrdinal = Number(throughRow.ordinal);
  const fromOrdinal = Number(firstRow.ordinal);
  if (fromOrdinal > requestedOrdinal) return null;
  const reviewedThroughRow = await db.prepare(`SELECT chapter_id, ordinal, title, reviewed FROM story_chapter_sequence
    WHERE novel_id = ? AND version = ? AND reviewed = 1 AND ordinal <= ? ORDER BY ordinal DESC LIMIT 1`)
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
      ORDER BY first_visible_ordinal, kind, label COLLATE NOCASE`).bind(novelId, version.version, dataEnd).all<Record<string, unknown>>(),
    db.prepare(`SELECT r.relation_id, r.source_entity_id, r.target_entity_id, r.relation_type, r.label, r.description,
      r.visible_from_ordinal, r.source_chapter_id, r.source_label, r.reviewed FROM story_relations r
      JOIN story_entities source ON source.novel_id = r.novel_id AND source.version = r.version AND source.entity_id = r.source_entity_id
      JOIN story_entities target ON target.novel_id = r.novel_id AND target.version = r.version AND target.entity_id = r.target_entity_id
      WHERE r.novel_id = ? AND r.version = ? AND r.visible_from_ordinal <= ?${relationReviewClause}
        AND source.first_visible_ordinal <= ? AND target.first_visible_ordinal <= ? ${includeUnreviewed ? "" : "AND source.reviewed = 1 AND target.reviewed = 1"}
      ORDER BY r.visible_from_ordinal, r.relation_id`).bind(novelId, version.version, dataEnd, dataEnd, dataEnd).all<Record<string, unknown>>(),
    db.prepare(`SELECT event_id, chapter_ordinal, chapter_id, kind, label, summary, entity_ids_json, source_label, reviewed
      FROM story_events WHERE novel_id = ? AND version = ? AND chapter_ordinal BETWEEN ? AND ?${reviewClause}
      ORDER BY chapter_ordinal, event_id`).bind(novelId, version.version, eventStart, dataEnd).all<Record<string, unknown>>(),
  ]);
  const nodes: AtlasNode[] = nodeRows.results.map((row) => ({
    id: String(row.entity_id), kind: atlasKindFromMetadata(String(row.kind)), label: String(row.label), description: String(row.description ?? ""), aliases: safeJsonStrings(String(row.aliases_json ?? "[]")),
    visibleFrom: Number(row.first_visible_ordinal), source: sourceRef(novelId, String(row.source_chapter_id), String(row.source_label ?? "")), reviewed: Number(row.reviewed) === 1,
  }));
  const edges: AtlasEdge[] = edgeRows.results.map((row) => ({
    id: String(row.relation_id), source: String(row.source_entity_id), target: String(row.target_entity_id), relation: String(row.relation_type), label: String(row.label), evidence: String(row.description ?? ""),
    visibleFrom: Number(row.visible_from_ordinal), sourceRef: sourceRef(novelId, String(row.source_chapter_id), String(row.source_label ?? "")), reviewed: Number(row.reviewed) === 1,
  }));
  const events: AtlasEvent[] = eventRows.results.map((row) => ({
    id: String(row.event_id), chapterOrdinal: Number(row.chapter_ordinal), chapterId: String(row.chapter_id), kind: String(row.kind), label: String(row.label), summary: String(row.summary),
    timelineOrder: "", locationIds: [], entityIds: safeJsonStrings(String(row.entity_ids_json ?? "[]")), causeEventIds: [], effectEventIds: [], certainty: "", evidence: "", source: sourceRef(novelId, String(row.chapter_id), String(row.source_label ?? "")), reviewed: Number(row.reviewed) === 1,
  }));
  return {
    novelId, version: Number(version.version), coverageNote: version.coverage_note, scope: normalized.scope ?? "through",
    from: { chapterId: firstRow.chapter_id, ordinal: fromOrdinal, title: firstRow.title, reviewed: Number(firstRow.reviewed ?? 0) === 1 },
    through: { chapterId: throughRow.chapter_id, ordinal: requestedOrdinal, title: throughRow.title, reviewed: Number(throughRow.reviewed ?? 0) === 1 },
    reviewedThrough: { chapterId: reviewedThroughRow.chapter_id, ordinal: reviewedOrdinal, title: reviewedThroughRow.title, reviewed: true },
    coverageLimited: requestedOrdinal > reviewedOrdinal, unreviewedUnlocked: includeUnreviewed && requestedOrdinal > reviewedOrdinal,
    nodes, edges, events, facts: [], states: [], scenes: [], arcs: [], cycles: [], characteristics: [], integrityIssueCount: 0,
  };
}

export async function loadAtlasData(db: D1DatabaseLike, novelId: string, options: AtlasLoadOptions | string): Promise<AtlasData | null> {
  const normalized: AtlasLoadOptions = typeof options === "string"
    ? { throughChapterId: options, scope: "through", includeUnreviewed: false }
    : options;
  const sync = await latestMetadataSync(db, novelId);
  if (sync) return loadCanonicalAtlasData(db, novelId, normalized, sync);
  return loadLegacyAtlasData(db, novelId, normalized);
}

/** Inline lookup intentionally remains review-only; reading a later chapter never auto-unlocks metadata spoilers. */
export async function loadInlineLookup(db: D1DatabaseLike, novelId: string, chapterId: string) {
  const atlas = await loadAtlasData(db, novelId, { throughChapterId: chapterId, scope: "through", includeUnreviewed: false });
  if (!atlas) return null;
  const detailedProfiles = new Map(
    atlas.characteristics
      .filter((profile) => profile.profileKind === "detailed")
      .map((profile) => [profile.entityId, profile]),
  );
  const entries = atlas.nodes.map((node) => {
    const profile = detailedProfiles.get(node.id);
    if (!profile) return node;
    const safeSummary = profile.abilitiesOrRole || profile.temperamentOrProperties || profile.characteristicAsOf;
    return safeSummary ? { ...node, description: safeSummary } : node;
  });
  return {
    version: atlas.version,
    through: atlas.through,
    reviewedThrough: atlas.reviewedThrough,
    coverageLimited: atlas.coverageLimited,
    coverageNote: atlas.coverageNote,
    entries,
  };
}

/**
 * Optional post-reading context for one reviewed chapter. This intentionally returns
 * only records revealed in that chapter; prior knowledge remains in Inline Lookup/Atlas.
 * The UI keeps this collapsed because summaries, scene participants and state changes
 * can spoil the chapter the reader is currently reading.
 */
export async function loadChapterContext(db: D1DatabaseLike, novelId: string, chapterId: string) {
  const atlas = await loadAtlasData(db, novelId, {
    fromChapterId: chapterId,
    throughChapterId: chapterId,
    scope: "range",
    includeUnreviewed: false,
  });
  if (!atlas || atlas.reviewedThrough.ordinal < atlas.through.ordinal) return null;
  const ordinal = atlas.through.ordinal;
  const relationships = atlas.edges.filter((edge) => edge.visibleFrom === ordinal);
  const facts = atlas.facts.filter((fact) => fact.visibleFrom === ordinal);
  const states = atlas.states.filter((state) => state.visibleFrom === ordinal);
  const events = atlas.events.filter((event) => event.chapterOrdinal === ordinal);
  const scenes = atlas.scenes.filter((scene) => scene.chapterOrdinal === ordinal);
  const entityIds = new Set<string>();
  for (const edge of relationships) { entityIds.add(edge.source); entityIds.add(edge.target); }
  for (const fact of facts) entityIds.add(fact.subjectId);
  for (const state of states) entityIds.add(state.entityId);
  for (const event of events) for (const id of event.entityIds) entityIds.add(id);
  for (const scene of scenes) {
    if (scene.povEntityId) entityIds.add(scene.povEntityId);
    for (const id of scene.participantIds) entityIds.add(id);
    for (const id of scene.locationIds) entityIds.add(id);
  }
  return {
    chapter: atlas.through,
    entities: atlas.nodes.filter((node) => entityIds.has(node.id)),
    relationships,
    facts,
    states,
    events,
    scenes,
  };
}
