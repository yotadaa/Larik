-- Canonical Markdown metadata v2 snapshot tables.
-- Populated by database/migrator.py after schema migration.
-- These tables deliberately keep source wording and evidence instead of inferring story facts at request time.

CREATE TABLE IF NOT EXISTS metadata_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  novel_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_file_count INTEGER NOT NULL DEFAULT 0,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  reviewed_through INTEGER NOT NULL DEFAULT 0,
  issue_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'complete',
  coverage_note TEXT NOT NULL DEFAULT '',
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS metadata_sync_runs_novel_latest
  ON metadata_sync_runs(novel_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS metadata_sync_runs_source
  ON metadata_sync_runs(novel_id, source_hash);

CREATE TABLE IF NOT EXISTS metadata_documents (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (novel_id, snapshot_id, filename)
);

CREATE TABLE IF NOT EXISTS metadata_chapters (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  chapter_number INTEGER NOT NULL,
  chapter_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  translation_status TEXT NOT NULL DEFAULT '',
  update_status TEXT NOT NULL DEFAULT '',
  metadata_status TEXT NOT NULL DEFAULT '',
  recap_path TEXT NOT NULL DEFAULT '',
  chapter_path TEXT NOT NULL DEFAULT '',
  content_exists INTEGER NOT NULL DEFAULT 0 CHECK (content_exists IN (0, 1)),
  recap_exists INTEGER NOT NULL DEFAULT 0 CHECK (recap_exists IN (0, 1)),
  source_hash TEXT NOT NULL DEFAULT '',
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (novel_id, snapshot_id, chapter_number),
  UNIQUE (novel_id, snapshot_id, chapter_id)
);
CREATE INDEX IF NOT EXISTS metadata_chapters_reader_window
  ON metadata_chapters(novel_id, content_exists, chapter_number);
CREATE INDEX IF NOT EXISTS metadata_chapters_reviewed
  ON metadata_chapters(novel_id, metadata_status, chapter_number);

CREATE TABLE IF NOT EXISTS metadata_entity_history (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  canonical_name TEXT NOT NULL DEFAULT '',
  first_seen_chapter INTEGER,
  reveal_chapter INTEGER,
  status TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (novel_id, snapshot_id, source_row)
);
CREATE INDEX IF NOT EXISTS metadata_entity_history_entity
  ON metadata_entity_history(novel_id, entity_id, source_row);

CREATE TABLE IF NOT EXISTS metadata_entities (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'other',
  canonical_name TEXT NOT NULL,
  first_seen_chapter INTEGER,
  reveal_chapter INTEGER,
  status TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  aliases_json TEXT NOT NULL DEFAULT '[]',
  source_chapter_id TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  PRIMARY KEY (novel_id, snapshot_id, entity_id)
);
CREATE INDEX IF NOT EXISTS metadata_entities_reveal
  ON metadata_entities(novel_id, reveal_chapter, entity_type, canonical_name);

CREATE TABLE IF NOT EXISTS metadata_aliases (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  alias_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  alias_kind TEXT NOT NULL DEFAULT '',
  valid_from_chapter INTEGER,
  valid_to_chapter INTEGER,
  reveal_chapter INTEGER,
  status TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source_chapter_id TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  PRIMARY KEY (novel_id, snapshot_id, alias_id)
);
CREATE INDEX IF NOT EXISTS metadata_aliases_entity
  ON metadata_aliases(novel_id, entity_id, reveal_chapter);

CREATE TABLE IF NOT EXISTS metadata_relationships (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT '',
  valid_from_chapter INTEGER,
  valid_to_chapter INTEGER,
  reveal_chapter INTEGER,
  cycle_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  certainty TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source_chapter_id TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  PRIMARY KEY (novel_id, snapshot_id, relationship_id)
);
CREATE INDEX IF NOT EXISTS metadata_relationships_reveal
  ON metadata_relationships(novel_id, reveal_chapter, source_entity_id, target_entity_id);

CREATE TABLE IF NOT EXISTS metadata_facts (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  fact_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_value TEXT NOT NULL DEFAULT '',
  value_type TEXT NOT NULL DEFAULT '',
  reveal_chapter INTEGER,
  valid_from_chapter INTEGER,
  valid_to_chapter INTEGER,
  cycle_id TEXT NOT NULL DEFAULT '',
  epistemic_status TEXT NOT NULL DEFAULT 'unknown',
  source_type TEXT NOT NULL DEFAULT '',
  source_entity_id TEXT NOT NULL DEFAULT '',
  supersedes TEXT NOT NULL DEFAULT '',
  contradicts TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source_chapter_id TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  PRIMARY KEY (novel_id, snapshot_id, fact_id)
);
CREATE INDEX IF NOT EXISTS metadata_facts_reveal
  ON metadata_facts(novel_id, reveal_chapter, subject_id, predicate);

CREATE TABLE IF NOT EXISTS metadata_events (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  chapter_number INTEGER NOT NULL,
  scene_id TEXT NOT NULL DEFAULT '',
  scene_order INTEGER,
  cycle_id TEXT NOT NULL DEFAULT '',
  timeline_order TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  location_ids_json TEXT NOT NULL DEFAULT '[]',
  participant_ids_json TEXT NOT NULL DEFAULT '[]',
  cause_event_ids_json TEXT NOT NULL DEFAULT '[]',
  effect_event_ids_json TEXT NOT NULL DEFAULT '[]',
  certainty TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  source_chapter_id TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  PRIMARY KEY (novel_id, snapshot_id, event_id)
);
CREATE INDEX IF NOT EXISTS metadata_events_chapter
  ON metadata_events(novel_id, chapter_number, scene_order, event_id);

CREATE TABLE IF NOT EXISTS metadata_states (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  state_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  property TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  value_type TEXT NOT NULL DEFAULT '',
  valid_from_chapter INTEGER,
  valid_to_chapter INTEGER,
  reveal_chapter INTEGER,
  cycle_id TEXT NOT NULL DEFAULT '',
  certainty TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source_chapter_id TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  PRIMARY KEY (novel_id, snapshot_id, state_id)
);
CREATE INDEX IF NOT EXISTS metadata_states_reveal
  ON metadata_states(novel_id, reveal_chapter, entity_id, property);

CREATE TABLE IF NOT EXISTS metadata_scenes (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  chapter_number INTEGER NOT NULL,
  scene_order INTEGER,
  cycle_id TEXT NOT NULL DEFAULT '',
  location_ids_json TEXT NOT NULL DEFAULT '[]',
  time_marker TEXT NOT NULL DEFAULT '',
  pov_entity_id TEXT NOT NULL DEFAULT '',
  participant_ids_json TEXT NOT NULL DEFAULT '[]',
  event_ids_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  source_chapter_id TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  PRIMARY KEY (novel_id, snapshot_id, scene_id)
);
CREATE INDEX IF NOT EXISTS metadata_scenes_chapter
  ON metadata_scenes(novel_id, chapter_number, scene_order, scene_id);

CREATE TABLE IF NOT EXISTS metadata_arcs (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  arc_id TEXT NOT NULL,
  title TEXT NOT NULL,
  parent_arc_id TEXT NOT NULL DEFAULT '',
  start_chapter INTEGER,
  end_chapter INTEGER,
  reveal_chapter INTEGER,
  cycle_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  key_entity_ids_json TEXT NOT NULL DEFAULT '[]',
  key_event_ids_json TEXT NOT NULL DEFAULT '[]',
  evidence TEXT NOT NULL DEFAULT '',
  source_chapter_id TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  PRIMARY KEY (novel_id, snapshot_id, arc_id)
);
CREATE INDEX IF NOT EXISTS metadata_arcs_window
  ON metadata_arcs(novel_id, start_chapter, end_chapter, reveal_chapter);

CREATE TABLE IF NOT EXISTS metadata_cycles (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  cycle_number INTEGER,
  start_chapter INTEGER,
  end_chapter INTEGER,
  reveal_chapter INTEGER,
  world_start_marker TEXT NOT NULL DEFAULT '',
  world_end_marker TEXT NOT NULL DEFAULT '',
  reset_trigger TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source_chapter_id TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  PRIMARY KEY (novel_id, snapshot_id, cycle_id)
);
CREATE INDEX IF NOT EXISTS metadata_cycles_window
  ON metadata_cycles(novel_id, start_chapter, end_chapter, reveal_chapter);

CREATE TABLE IF NOT EXISTS metadata_characteristics (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  entity_id TEXT NOT NULL,
  profile_kind TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  canonical_name TEXT NOT NULL DEFAULT '',
  first_seen_chapter INTEGER,
  physical_form TEXT NOT NULL DEFAULT '',
  temperament_or_properties TEXT NOT NULL DEFAULT '',
  abilities_or_role TEXT NOT NULL DEFAULT '',
  relationships_status TEXT NOT NULL DEFAULT '',
  characteristic_as_of TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (novel_id, snapshot_id, source_row)
);
CREATE INDEX IF NOT EXISTS metadata_characteristics_entity
  ON metadata_characteristics(novel_id, entity_id, source_row);

CREATE TABLE IF NOT EXISTS metadata_integrity_issues (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  source_file TEXT NOT NULL DEFAULT '',
  record_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL,
  PRIMARY KEY (novel_id, snapshot_id, issue_id)
);
CREATE INDEX IF NOT EXISTS metadata_integrity_severity
  ON metadata_integrity_issues(novel_id, severity, code);

-- Persistent staging table lets the corpus sync upload large chapter bodies in chunks,
-- then replace the reader-facing snapshot in one short transaction.
CREATE TABLE IF NOT EXISTS metadata_novel_content_stage (
  sync_token TEXT NOT NULL,
  novel_id TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT '',
  novel_title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  chapter_title TEXT NOT NULL DEFAULT '',
  recap TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (sync_token, novel_id, chapter_id)
);
CREATE INDEX IF NOT EXISTS metadata_novel_content_stage_token
  ON metadata_novel_content_stage(sync_token, novel_id);

CREATE TABLE IF NOT EXISTS metadata_glossary (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  source_term TEXT NOT NULL,
  canonical_translation TEXT NOT NULL DEFAULT '',
  term_type TEXT NOT NULL DEFAULT '',
  first_seen_chapter INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (novel_id, snapshot_id, source_row)
);
CREATE INDEX IF NOT EXISTS metadata_glossary_lookup
  ON metadata_glossary(novel_id, canonical_translation, source_term);

CREATE TABLE IF NOT EXISTS metadata_memory_entries (
  novel_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  source_chapter_id TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (novel_id, snapshot_id, source_file, source_row)
);
CREATE INDEX IF NOT EXISTS metadata_memory_entries_source
  ON metadata_memory_entries(novel_id, source_file, source_row);
