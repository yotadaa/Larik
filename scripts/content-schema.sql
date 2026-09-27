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
