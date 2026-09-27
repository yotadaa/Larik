-- Reconstructed from the queries/tests in the supplied archive.
-- Local initialization only. Verify existing remote schema before deploying.
CREATE TABLE IF NOT EXISTS "novel" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "novel_id" TEXT, "novel-title" TEXT, "lang" TEXT
);
CREATE TABLE IF NOT EXISTS "novel-content" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "path" TEXT, "name" TEXT, "type" TEXT, "lang" TEXT,
  "novel-id" TEXT, "novel-title" TEXT, "content" TEXT,
  "chapter-id" TEXT, "chapter-title" TEXT, "recap" TEXT
);
CREATE TABLE IF NOT EXISTS "characters" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "novel-id" TEXT, "character-name" TEXT, "character-description" TEXT
);
CREATE TABLE IF NOT EXISTS "glossariums" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "novel-id" TEXT, "source-term" TEXT, "canonical-translation" TEXT,
  "type" TEXT, "first-seen" TEXT, "notes" TEXT
);
CREATE TABLE IF NOT EXISTS "locations" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT, "novel-id" TEXT, "location" TEXT
);
CREATE TABLE IF NOT EXISTS "terminologies" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT, "novel-id" TEXT, "term" TEXT
);
CREATE TABLE IF NOT EXISTS "continuities" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT, "novel-id" TEXT, "content" TEXT
);
CREATE TABLE IF NOT EXISTS "qa-log" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT, "novel-id" TEXT, "log" TEXT
);
CREATE INDEX IF NOT EXISTS local_novel_key ON "novel"("novel_id", "id");
CREATE INDEX IF NOT EXISTS local_chapter_key ON "novel-content"("novel-id", "chapter-id", "id");

INSERT INTO "novel" ("novel_id", "novel-title", "lang") VALUES
('a-regressors-tale-of-cultivation', 'A Regressor''s Tale of Cultivation', 'id'),
('the-second-book', 'The Second Book', 'en');
INSERT INTO "novel-content" ("novel-id", "chapter-id", "chapter-title", "content", "recap", "lang", "novel-title") VALUES
('a-regressors-tale-of-cultivation', '001-prologue!.md', 'Prologue', 'Versi lama', 'A recap', 'id', 'A Regressor''s Tale of Cultivation'),
('a-regressors-tale-of-cultivation', '001-prologue!.md', 'Prologue', 'Versi terbaru', 'A recap', 'id', 'A Regressor''s Tale of Cultivation'),
('a-regressors-tale-of-cultivation', '002-rain & iron.md', 'Rain and Iron', 'The second chapter.', '', 'id', 'A Regressor''s Tale of Cultivation'),
('the-second-book', '001-start.md', 'Beginning', 'Another novel.', '', 'en', 'The Second Book');
INSERT INTO "characters" ("novel-id", "character-name", "character-description") VALUES
('a-regressors-tale-of-cultivation', 'Seo Eun-hyun', 'Deskripsi lama'),
('a-regressors-tale-of-cultivation', 'Seo Eun-hyun', 'Deskripsi terbaru');
INSERT INTO "locations" ("novel-id", "location") VALUES ('a-regressors-tale-of-cultivation', 'The forest');
INSERT INTO "terminologies" ("novel-id", "term") VALUES ('a-regressors-tale-of-cultivation', 'Qi');
INSERT INTO "continuities" ("novel-id", "content") VALUES ('a-regressors-tale-of-cultivation', 'Bab 1: Seo Eun-hyun returns.');
INSERT INTO "qa-log" ("novel-id", "log") VALUES ('a-regressors-tale-of-cultivation', 'Bab 1: Keep the canonical name.');
