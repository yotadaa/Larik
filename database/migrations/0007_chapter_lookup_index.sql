-- Production novel-content had no BINARY index at all: chapter lookups and the
-- neighbour JOIN in getChapter() scanned every row of the novel (750 rows each,
-- ~6.5k rows per chapter view). The NOCASE index (0006) only serves the ordered
-- range; equality lookups need this one.
CREATE INDEX IF NOT EXISTS idx_larik_chapters_lookup
  ON "novel-content" ("novel-id", "chapter-id", "id");
