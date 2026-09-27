-- Full-story atlas range support.
-- Version 2 keeps manually reviewed v1 facts intact, then adds metadata-derived facts/events
-- for the full imported corpus. Metadata-derived rows remain reviewed=0 and are only returned
-- after an explicit spoiler unlock in the application.
PRAGMA foreign_keys = ON;

ALTER TABLE story_chapter_sequence
  ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0 CHECK(reviewed IN (0, 1));

-- v1 contained only explicitly reviewed pilot chapters.
UPDATE story_chapter_sequence
SET reviewed = 1
WHERE version = 1;

INSERT OR IGNORE INTO story_knowledge_versions
  (novel_id, version, status, coverage_note, published_at)
VALUES
  ('a-regressors-tale-of-cultivation', 2, 'published',
   'Manually reviewed facts cover the opening pilot; metadata-derived glossary and recap coverage spans the imported story and requires an explicit spoiler unlock.',
   1790546400);

-- Precompute the complete chapter sequence in D1. No request-time markdown scanning is needed.
INSERT OR IGNORE INTO story_chapter_sequence
  (novel_id, version, chapter_id, ordinal, title, reviewed)
WITH latest_chapters AS (
  SELECT "chapter-id" AS chapter_id, MAX(id) AS latest_id
  FROM "novel-content"
  WHERE "novel-id" = 'a-regressors-tale-of-cultivation'
  GROUP BY "chapter-id"
), ordered_chapters AS (
  SELECT nc."chapter-id" AS chapter_id,
         ROW_NUMBER() OVER (ORDER BY nc."chapter-id" COLLATE NOCASE ASC) AS ordinal,
         COALESCE(nc."chapter-title", '') AS title
  FROM "novel-content" nc
  JOIN latest_chapters lc ON lc.latest_id = nc.id
)
SELECT 'a-regressors-tale-of-cultivation', 2, c.chapter_id, c.ordinal, c.title,
       CASE WHEN EXISTS (
         SELECT 1 FROM story_chapter_sequence old
         WHERE old.novel_id = 'a-regressors-tale-of-cultivation'
           AND old.version = 1 AND old.chapter_id = c.chapter_id AND old.reviewed = 1
       ) THEN 1 ELSE 0 END
FROM ordered_chapters c;

-- Preserve the manually reviewed pilot in the new version.
INSERT OR IGNORE INTO story_entities
  (novel_id, version, entity_id, kind, label, description, aliases_json, first_visible_ordinal, source_chapter_id, source_label, reviewed)
SELECT novel_id, 2, entity_id, kind, label, description, aliases_json, first_visible_ordinal, source_chapter_id, source_label, reviewed
FROM story_entities
WHERE novel_id = 'a-regressors-tale-of-cultivation' AND version = 1;

INSERT OR IGNORE INTO story_relations
  (novel_id, version, relation_id, source_entity_id, target_entity_id, relation_type, label, description, visible_from_ordinal, source_chapter_id, source_label, reviewed)
SELECT novel_id, 2, relation_id, source_entity_id, target_entity_id, relation_type, label, description, visible_from_ordinal, source_chapter_id, source_label, reviewed
FROM story_relations
WHERE novel_id = 'a-regressors-tale-of-cultivation' AND version = 1;

INSERT OR IGNORE INTO story_events
  (novel_id, version, event_id, chapter_ordinal, chapter_id, kind, label, summary, entity_ids_json, source_label, reviewed)
SELECT novel_id, 2, event_id, chapter_ordinal, chapter_id, kind, label, summary, entity_ids_json, source_label, reviewed
FROM story_events
WHERE novel_id = 'a-regressors-tale-of-cultivation' AND version = 1;

-- Materialize glossary rows as reference facts. They are intentionally NOT marked reviewed.
-- first-seen is stored as "Ch. N" in the imported corpus; SQLite CAST safely reads the leading integer.
INSERT OR IGNORE INTO story_entities
  (novel_id, version, entity_id, kind, label, description, aliases_json, first_visible_ordinal, source_chapter_id, source_label, reviewed)
WITH latest_glossary AS (
  SELECT COALESCE("source-term", '') AS source_term, MAX(id) AS latest_id
  FROM glossariums
  WHERE "novel-id" = 'a-regressors-tale-of-cultivation'
  GROUP BY COALESCE("source-term", '')
), prepared AS (
  SELECT g.id,
         COALESCE(NULLIF(trim(g."canonical-translation"), ''), trim(g."source-term")) AS label,
         COALESCE(g."notes", '') AS description,
         lower(COALESCE(g."type", '')) AS source_type,
         CAST(trim(replace(replace(lower(COALESCE(g."first-seen", '')), 'ch.', ''), 'bab', '')) AS INTEGER) AS ordinal
  FROM glossariums g
  JOIN latest_glossary lg ON lg.latest_id = g.id
  WHERE trim(COALESCE(g."source-term", '')) <> ''
), mapped AS (
  SELECT p.*,
         CASE
           WHEN source_type LIKE '%character%' THEN 'character'
           WHEN source_type LIKE '%location%' THEN 'location'
           WHEN source_type LIKE '%organization%' THEN 'organization'
           WHEN source_type LIKE '%item%' THEN 'item'
           ELSE 'term'
         END AS atlas_kind
  FROM prepared p
)
SELECT 'a-regressors-tale-of-cultivation', 2, 'meta-g-' || m.id, m.atlas_kind, m.label,
       m.description, '[]', m.ordinal, seq.chapter_id, 'Chapter ' || seq.ordinal || ' metadata', 0
FROM mapped m
JOIN story_chapter_sequence seq
  ON seq.novel_id = 'a-regressors-tale-of-cultivation' AND seq.version = 2 AND seq.ordinal = m.ordinal
WHERE m.ordinal > 0
  AND NOT EXISTS (
    SELECT 1 FROM story_entities existing
    WHERE existing.novel_id = 'a-regressors-tale-of-cultivation' AND existing.version = 2
      AND lower(existing.label) = lower(m.label)
  );

-- Structural links make the network useful beyond the manually curated pilot without
-- pretending that co-indexed terms have a semantic story relationship. Each chapter's
-- metadata entries are connected as a light chain, not an O(n^2) clique.
INSERT OR IGNORE INTO story_relations
  (novel_id, version, relation_id, source_entity_id, target_entity_id, relation_type, label, description, visible_from_ordinal, source_chapter_id, source_label, reviewed)
WITH ordered_metadata AS (
  SELECT entity_id, first_visible_ordinal, source_chapter_id, source_label,
         LAG(entity_id) OVER (PARTITION BY first_visible_ordinal ORDER BY entity_id) AS previous_entity_id
  FROM story_entities
  WHERE novel_id = 'a-regressors-tale-of-cultivation' AND version = 2 AND reviewed = 0
)
SELECT 'a-regressors-tale-of-cultivation', 2,
       'meta-context-' || first_visible_ordinal || '-' || entity_id,
       previous_entity_id, entity_id, 'co-indexed', 'Same reveal chapter',
       'Metadata context only: both entries are first indexed in the same chapter. This line does not assert a story relationship.',
       first_visible_ordinal, source_chapter_id, source_label, 0
FROM ordered_metadata
WHERE previous_entity_id IS NOT NULL;

-- Materialize one compact recap event for every non-reviewed chapter. This gives the
-- Events and Storyline views full-corpus temporal coverage without parsing prose at request time.
INSERT OR IGNORE INTO story_events
  (novel_id, version, event_id, chapter_ordinal, chapter_id, kind, label, summary, entity_ids_json, source_label, reviewed)
WITH latest_chapters AS (
  SELECT "chapter-id" AS chapter_id, MAX(id) AS latest_id
  FROM "novel-content"
  WHERE "novel-id" = 'a-regressors-tale-of-cultivation'
  GROUP BY "chapter-id"
)
SELECT 'a-regressors-tale-of-cultivation', 2,
       'meta-recap-' || seq.ordinal,
       seq.ordinal, seq.chapter_id, 'chapter-recap',
       CASE WHEN trim(seq.title) = '' THEN 'Chapter ' || seq.ordinal ELSE seq.title END,
       substr(trim(COALESCE(nc.recap, '')), 1, 1800),
       '[]', 'Chapter ' || seq.ordinal || ' recap', 0
FROM story_chapter_sequence seq
JOIN latest_chapters lc ON lc.chapter_id = seq.chapter_id
JOIN "novel-content" nc ON nc.id = lc.latest_id
WHERE seq.novel_id = 'a-regressors-tale-of-cultivation' AND seq.version = 2
  AND length(trim(COALESCE(nc.recap, ''))) > 0
  AND NOT EXISTS (
    SELECT 1 FROM story_events reviewed_event
    WHERE reviewed_event.novel_id = seq.novel_id AND reviewed_event.version = 2
      AND reviewed_event.chapter_id = seq.chapter_id AND reviewed_event.reviewed = 1
  );

UPDATE story_knowledge_versions
SET status = 'retired'
WHERE novel_id = 'a-regressors-tale-of-cultivation' AND version = 1;
