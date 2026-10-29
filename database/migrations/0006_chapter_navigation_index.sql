-- Chapter navigation walks neighbour chapters in COLLATE NOCASE chapter-id order.
-- The existing idx_larik_chapters_lookup index is BINARY, so a NOCASE range predicate
-- could not use it and every chapter view scanned the whole novel.
-- ponytail: index only; drop it if neighbour lookups ever change to ordinal range scans.
CREATE INDEX IF NOT EXISTS idx_larik_chapters_nocase
  ON "novel-content" ("novel-id", "chapter-id" COLLATE NOCASE, "id");
