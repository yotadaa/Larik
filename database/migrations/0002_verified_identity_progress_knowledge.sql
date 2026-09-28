-- Password accounts, reader state, curated spoiler-safe knowledge, and D1-native search.
-- Additive: existing prototype users/bookmarks are preserved. Existing sessions remain marked
-- as prototype sessions and are not accepted by the new password-authenticated application.
PRAGMA foreign_keys = ON;

ALTER TABLE reader_users ADD COLUMN password_hash TEXT;
ALTER TABLE reader_users ADD COLUMN password_salt TEXT;
ALTER TABLE reader_users ADD COLUMN password_iterations INTEGER;
ALTER TABLE reader_users ADD COLUMN registered_at INTEGER;
ALTER TABLE reader_sessions ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'prototype';

CREATE TABLE IF NOT EXISTS reader_library_state (
  user_id TEXT NOT NULL REFERENCES reader_users(id) ON DELETE CASCADE,
  novel_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reading' CHECK(status IN ('planned', 'reading', 'paused', 'finished')),
  last_chapter_id TEXT NOT NULL DEFAULT '',
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK(progress_percent BETWEEN 0 AND 100),
  progress_sync_count INTEGER NOT NULL DEFAULT 0 CHECK(progress_sync_count >= 0),
  resume_open_count INTEGER NOT NULL DEFAULT 0 CHECK(resume_open_count >= 0),
  last_resumed_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, novel_id)
);
CREATE INDEX IF NOT EXISTS reader_library_state_recent
  ON reader_library_state(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS story_knowledge_versions (
  novel_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'published', 'retired')),
  coverage_note TEXT NOT NULL DEFAULT '',
  published_at INTEGER,
  PRIMARY KEY (novel_id, version)
);
CREATE INDEX IF NOT EXISTS story_knowledge_published
  ON story_knowledge_versions(novel_id, status, version DESC);

CREATE TABLE IF NOT EXISTS story_chapter_sequence (
  novel_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  chapter_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal > 0),
  title TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (novel_id, version, chapter_id),
  UNIQUE (novel_id, version, ordinal),
  FOREIGN KEY (novel_id, version) REFERENCES story_knowledge_versions(novel_id, version) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS story_entities (
  novel_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  entity_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('character', 'location', 'term', 'organization', 'item')),
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  aliases_json TEXT NOT NULL DEFAULT '[]',
  first_visible_ordinal INTEGER NOT NULL CHECK(first_visible_ordinal > 0),
  source_chapter_id TEXT NOT NULL,
  source_label TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK(reviewed IN (0, 1)),
  PRIMARY KEY (novel_id, version, entity_id),
  FOREIGN KEY (novel_id, version) REFERENCES story_knowledge_versions(novel_id, version) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS story_entities_visibility
  ON story_entities(novel_id, version, first_visible_ordinal, kind);

CREATE TABLE IF NOT EXISTS story_relations (
  novel_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  relation_id TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visible_from_ordinal INTEGER NOT NULL CHECK(visible_from_ordinal > 0),
  source_chapter_id TEXT NOT NULL,
  source_label TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK(reviewed IN (0, 1)),
  PRIMARY KEY (novel_id, version, relation_id),
  FOREIGN KEY (novel_id, version, source_entity_id) REFERENCES story_entities(novel_id, version, entity_id) ON DELETE CASCADE,
  FOREIGN KEY (novel_id, version, target_entity_id) REFERENCES story_entities(novel_id, version, entity_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS story_relations_visibility
  ON story_relations(novel_id, version, visible_from_ordinal);

CREATE TABLE IF NOT EXISTS story_events (
  novel_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  chapter_ordinal INTEGER NOT NULL CHECK(chapter_ordinal > 0),
  chapter_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  summary TEXT NOT NULL,
  entity_ids_json TEXT NOT NULL DEFAULT '[]',
  source_label TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK(reviewed IN (0, 1)),
  PRIMARY KEY (novel_id, version, event_id),
  FOREIGN KEY (novel_id, version) REFERENCES story_knowledge_versions(novel_id, version) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS story_events_visibility
  ON story_events(novel_id, version, chapter_ordinal);

-- D1 supports SQLite FTS5. This index is maintained by D1 triggers; the Worker only binds
-- the user's query and displays the database result.
CREATE VIRTUAL TABLE IF NOT EXISTS story_chapter_fts USING fts5(
  novel_id UNINDEXED,
  chapter_id,
  title,
  content,
  tokenize = 'unicode61 remove_diacritics 2'
);

DELETE FROM story_chapter_fts;
INSERT INTO story_chapter_fts(rowid, novel_id, chapter_id, title, content)
SELECT nc.id,
       COALESCE(nc."novel-id", ''),
       COALESCE(nc."chapter-id", ''),
       COALESCE(nc."chapter-title", ''),
       COALESCE(nc."content", '')
FROM "novel-content" nc
JOIN (
  SELECT "novel-id" AS novel_id, "chapter-id" AS chapter_id, MAX(id) AS latest_id
  FROM "novel-content"
  GROUP BY "novel-id", "chapter-id"
) latest ON latest.latest_id = nc.id;

CREATE TRIGGER IF NOT EXISTS story_chapter_fts_insert
AFTER INSERT ON "novel-content"
BEGIN
  DELETE FROM story_chapter_fts
  WHERE novel_id = NEW."novel-id" AND chapter_id = NEW."chapter-id";
  INSERT INTO story_chapter_fts(rowid, novel_id, chapter_id, title, content)
  VALUES (NEW.id, COALESCE(NEW."novel-id", ''), COALESCE(NEW."chapter-id", ''),
          COALESCE(NEW."chapter-title", ''), COALESCE(NEW."content", ''));
END;

-- Curated pilot, version 1. The visibility boundary is explicit and conservative: only
-- reviewed facts with a known reveal chapter are included. This pilot intentionally covers
-- chapters 1-3 only; later chapters remain unavailable rather than guessed safe.
INSERT OR IGNORE INTO story_knowledge_versions
  (novel_id, version, status, coverage_note, published_at)
VALUES
  ('a-regressors-tale-of-cultivation', 1, 'published',
   'Manually curated spoiler-safe pilot covering chapters 1-3 only.', 1790542800);

INSERT OR IGNORE INTO story_chapter_sequence
  (novel_id, version, chapter_id, ordinal, title)
VALUES
  ('a-regressors-tale-of-cultivation', 1, '001-hari-pertama-regresor.md', 1, 'Hari Pertama Sang Regresor'),
  ('a-regressors-tale-of-cultivation', 1, '002-takdir-yang-tersebar.md', 2, 'Takdir yang Tersebar (1)'),
  ('a-regressors-tale-of-cultivation', 1, '003-takdir-yang-tersebar.md', 3, 'Takdir yang Tersebar (2)');

INSERT OR IGNORE INTO story_entities
  (novel_id, version, entity_id, kind, label, description, aliases_json, first_visible_ordinal, source_chapter_id, source_label, reviewed)
VALUES
  ('a-regressors-tale-of-cultivation', 1, 'seo-eun-hyun', 'character', 'Seo Eun-hyun',
   'The point-of-view character and an SJD vice manager. In chapter 1 he recognizes that he has returned to the first day in this world after living here for fifty years.',
   '["Vice Manager Seo","Seo"]', 1, '001-hari-pertama-regresor.md', 'Chapter 1', 1),
  ('a-regressors-tale-of-cultivation', 1, 'jeon-myeong-hoon', 'character', 'Jeon Myeong-hoon',
   'An SJD section chief and Seo Eun-hyun''s coworker. Chapter 1 identifies him as Jeon Myeong-cheol''s nephew.',
   '["Section Chief Jeon"]', 1, '001-hari-pertama-regresor.md', 'Chapter 1', 1),
  ('a-regressors-tale-of-cultivation', 1, 'kim-young-hoon', 'character', 'Kim Young-hoon',
   'An SJD director traveling with the group.',
   '["Director Kim"]', 1, '001-hari-pertama-regresor.md', 'Chapter 1', 1),
  ('a-regressors-tale-of-cultivation', 1, 'oh-hyun-seok', 'character', 'Oh Hyun-seok',
   'An SJD department head traveling with the group.',
   '["Department Head Oh","Chief Oh"]', 1, '001-hari-pertama-regresor.md', 'Chapter 1', 1),
  ('a-regressors-tale-of-cultivation', 1, 'cultivator', 'term', 'cultivator',
   'A practitioner of cultivation. The group discusses the concept while trying to understand the unfamiliar world.',
   '[]', 2, '002-takdir-yang-tersebar.md', 'Chapter 2', 1),
  ('a-regressors-tale-of-cultivation', 1, 'yellow-bamboo-root', 'item', 'Yellow Bamboo Root',
   'A medicinal plant Seo recognizes from his previous life.',
   '[]', 2, '002-takdir-yang-tersebar.md', 'Chapter 2', 1),
  ('a-regressors-tale-of-cultivation', 1, 'ascension-gate', 'location', 'Ascension Gate',
   'A named destination associated with the cultivators who appear around the group.',
   '["Gate of Ascension"]', 2, '002-takdir-yang-tersebar.md', 'Chapter 2', 1),
  ('a-regressors-tale-of-cultivation', 1, 'kim-yeon', 'character', 'Kim Yeon',
   'An SJD manager traveling with Seo and Director Kim. In chapter 3 her awareness suddenly reaches several kilometers.',
   '["Manager Kim"]', 3, '003-takdir-yang-tersebar.md', 'Chapter 3', 1),
  ('a-regressors-tale-of-cultivation', 1, 'path-to-ascension', 'location', 'Path to Ascension',
   'The area around the Ascension Gate where the group has arrived.',
   '["Ascension Path"]', 3, '003-takdir-yang-tersebar.md', 'Chapter 3', 1);

INSERT OR IGNORE INTO story_relations
  (novel_id, version, relation_id, source_entity_id, target_entity_id, relation_type, label, description, visible_from_ordinal, source_chapter_id, source_label, reviewed)
VALUES
  ('a-regressors-tale-of-cultivation', 1, 'seo-jeon-coworkers', 'seo-eun-hyun', 'jeon-myeong-hoon', 'coworker', 'SJD coworkers',
   'Both are employees of SJD and are traveling together when the group arrives in the unfamiliar world.', 1, '001-hari-pertama-regresor.md', 'Chapter 1', 1),
  ('a-regressors-tale-of-cultivation', 1, 'seo-kim-young-hoon-coworkers', 'seo-eun-hyun', 'kim-young-hoon', 'coworker', 'SJD coworkers',
   'Seo is a vice manager and Kim Young-hoon is a director at SJD.', 1, '001-hari-pertama-regresor.md', 'Chapter 1', 1),
  ('a-regressors-tale-of-cultivation', 1, 'seo-oh-hyun-seok-coworkers', 'seo-eun-hyun', 'oh-hyun-seok', 'coworker', 'SJD coworkers',
   'Seo and Oh Hyun-seok are members of the same SJD group.', 1, '001-hari-pertama-regresor.md', 'Chapter 1', 1),
  ('a-regressors-tale-of-cultivation', 1, 'seo-kim-yeon-coworkers', 'seo-eun-hyun', 'kim-yeon', 'coworker', 'SJD coworkers',
   'Seo and Kim Yeon are members of the SJD group. This entry becomes visible only when Kim Yeon is introduced in the curated model.', 3, '003-takdir-yang-tersebar.md', 'Chapter 3', 1);

INSERT OR IGNORE INTO story_events
  (novel_id, version, event_id, chapter_ordinal, chapter_id, kind, label, summary, entity_ids_json, source_label, reviewed)
VALUES
  ('a-regressors-tale-of-cultivation', 1, 'return-first-day', 1, '001-hari-pertama-regresor.md', 'revelation', 'Seo recognizes the first day',
   'Seo realizes he has returned to the group''s first day in the unfamiliar world, carrying memories of the previous fifty years.',
   '["seo-eun-hyun"]', 'Chapter 1', 1),
  ('a-regressors-tale-of-cultivation', 1, 'forest-offering', 2, '002-takdir-yang-tersebar.md', 'event', 'The forest offering',
   'Seo offers his left arm to the fox so the group can remain in its territory for seven nights.',
   '["seo-eun-hyun"]', 'Chapter 2', 1),
  ('a-regressors-tale-of-cultivation', 1, 'kim-yeon-awareness', 3, '003-takdir-yang-tersebar.md', 'revelation', 'Kim Yeon''s awareness awakens',
   'Kim Yeon suddenly senses her surroundings across several kilometers, drawing the attention of a cultivator who arrives from the direction of the Ascension Gate.',
   '["kim-yeon","ascension-gate"]', 'Chapter 3', 1);
