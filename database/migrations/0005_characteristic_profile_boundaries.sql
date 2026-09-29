-- Make cumulative characteristic/profile snapshots explicitly spoiler-boundary aware.
-- Detailed profile prose may summarize many chapters and must not inherit the entity's first reveal.
ALTER TABLE metadata_characteristics ADD COLUMN profile_through_chapter INTEGER;

CREATE INDEX IF NOT EXISTS metadata_characteristics_visibility
  ON metadata_characteristics(novel_id, snapshot_id, profile_through_chapter, first_seen_chapter, entity_id);
