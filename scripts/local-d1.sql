DROP TABLE IF EXISTS "novel";
DROP TABLE IF EXISTS "novel-content";
DROP TABLE IF EXISTS "characters";
DROP TABLE IF EXISTS "continuities";
DROP TABLE IF EXISTS "glossariums";
DROP TABLE IF EXISTS "locations";
DROP TABLE IF EXISTS "terminologies";
DROP TABLE IF EXISTS "qa-log";

CREATE TABLE "novel" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "novel-title" TEXT,
  "novel_id" TEXT,
  "lang" TEXT
);
CREATE TABLE "novel-content" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "path" TEXT,
  "name" TEXT,
  "type" TEXT,
  "lang" TEXT,
  "novel-id" TEXT,
  "novel-title" TEXT,
  "content" TEXT,
  "chapter-id" TEXT,
  "chapter-title" TEXT,
  "recap" TEXT
);
CREATE TABLE "characters" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "character-name" TEXT,
  "character-description" TEXT,
  "novel-id" TEXT
);
CREATE TABLE "continuities" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "content" TEXT, "novel-id" TEXT);
CREATE TABLE "glossariums" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "source-term" TEXT,
  "canonical-translation" TEXT,
  "type" TEXT,
  "first-seen" TEXT,
  "notes" TEXT,
  "novel-id" TEXT
);
CREATE TABLE "locations" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "location" TEXT, "novel-id" TEXT);
CREATE TABLE "terminologies" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "term" TEXT, "novel-id" TEXT);
CREATE TABLE "qa-log" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "log" TEXT, "novel-id" TEXT);

INSERT INTO "novel" ("novel-title", "novel_id", "lang") VALUES
  ('A Regressor''s Tale of Cultivation', 'a-regressors-tale-of-cultivation', 'id'),
  ('The Quiet Archive', 'quiet-archive', 'en');

INSERT INTO "novel-content" ("path","name","type","lang","novel-id","novel-title","content","chapter-id","chapter-title","recap") VALUES
  ('id/a/chapters/001-prologue!.md','001-prologue!.md','md','id','a-regressors-tale-of-cultivation','A Regressor''s Tale of Cultivation','# Bab 1 — Hari Pertama\n\nAku membuka mata di dunia yang asing.','001-prologue!.md','Bab 1 — Hari Pertama','# Rekap\n\nAwal regresi.'),
  ('id/a/chapters/002-rain & iron.md','002-rain & iron.md','md','id','a-regressors-tale-of-cultivation','A Regressor''s Tale of Cultivation','# Bab 2 — Hujan & Besi\n\nPerjalanan berlanjut.','002-rain & iron.md','Bab 2 — Hujan & Besi',''),
  ('en/q/chapters/prologue.md','prologue.md','md','en','quiet-archive','The Quiet Archive','# Prologue\n\nSilence has a history.','prologue.md','Prologue','');

-- Newer duplicate chapter row, mirroring the migrator's append-only update behavior.
INSERT INTO "novel-content" ("path","name","type","lang","novel-id","novel-title","content","chapter-id","chapter-title","recap") VALUES
  ('id/a/chapters/001-prologue!.md','001-prologue!.md','md','id','a-regressors-tale-of-cultivation','A Regressor''s Tale of Cultivation','# Bab 1 — Hari Pertama\n\nVersi terbaru dari bab pertama.','001-prologue!.md','Bab 1 — Hari Pertama','# Rekap\n\nAwal regresi, diperbarui.');

INSERT INTO "characters" ("character-name","character-description","novel-id") VALUES
  ('Seo Eun-hyun','Tokoh utama dan seorang regresor.','a-regressors-tale-of-cultivation'),
  ('Seo Eun-hyun','Tokoh utama; deskripsi terbaru.','a-regressors-tale-of-cultivation');
INSERT INTO "locations" ("location","novel-id") VALUES ('Desa Cheongmun — Permukiman awal.','a-regressors-tale-of-cultivation');
INSERT INTO "terminologies" ("term","novel-id") VALUES ('Qi Refining: Tahap pemurnian qi.','a-regressors-tale-of-cultivation');
INSERT INTO "continuities" ("content","novel-id") VALUES ('Seo Eun-hyun masih menyembunyikan kemampuan regresinya.','a-regressors-tale-of-cultivation');
INSERT INTO "qa-log" ("log","novel-id") VALUES ('Pertahankan istilah Qi Refining secara konsisten.','a-regressors-tale-of-cultivation');
-- glossariums intentionally left empty to verify the documented current migration behavior.
