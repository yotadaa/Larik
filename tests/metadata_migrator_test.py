from __future__ import annotations

import io
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from database.migrator import CANONICAL_TABLES, ROOT, SnapshotBuilder, discover_series_dirs, main


NOVEL_DIR = ROOT / "id" / "a-regressors-tale-of-cultivation"


class MetadataMigratorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot = SnapshotBuilder(NOVEL_DIR).build()

    def test_current_workspace_parses_without_validation_errors(self):
        self.assertEqual(24, len(self.snapshot.documents))
        self.assertEqual(200, self.snapshot.actual_chapter_count)
        self.assertEqual(200, len(self.snapshot.recaps))
        self.assertEqual(163, self.snapshot.reviewed_through)
        self.assertFalse([issue for issue in self.snapshot.issues if issue.severity == "error"])
        self.assertFalse(any(issue.code == "chapter_recap_missing" for issue in self.snapshot.issues))
        self.assertTrue(any(issue.code == "duplicate_entity_id" for issue in self.snapshot.issues))
        detailed = [row for row in self.snapshot.tables["metadata_characteristics"] if row["profile_kind"] == "detailed"]
        registry = [row for row in self.snapshot.tables["metadata_characteristics"] if row["profile_kind"] == "registry"]
        self.assertTrue(detailed)
        self.assertTrue(registry)
        self.assertTrue(all(row["profile_through_chapter"] == 151 for row in detailed))
        self.assertTrue(all(row["profile_through_chapter"] == row["first_seen_chapter"] for row in registry))
        seo = next(row for row in self.snapshot.tables["metadata_entities"] if row["entity_id"] == "char:seo-eun-hyun")
        self.assertNotIn("Tekun", seo["description"])
        self.assertNotIn("Bright Cold Realm", seo["description"])

    def test_all_canonical_rows_fit_the_database_contract(self):
        connection = sqlite3.connect(":memory:")
        connection.executescript((ROOT / "database" / "schema" / "content-schema.sql").read_text(encoding="utf-8"))
        for path in sorted((ROOT / "database" / "migrations").glob("*.sql")):
            connection.executescript(path.read_text(encoding="utf-8"))
        snapshot_id = self.snapshot.metadata_source_hash
        for table in CANONICAL_TABLES:
            for row in self.snapshot.tables[table]:
                enriched = {"novel_id": row["novel_id"], "snapshot_id": snapshot_id, **{key: value for key, value in row.items() if key != "novel_id"}}
                columns = list(enriched)
                placeholders = ",".join("?" for _ in columns)
                quoted = ",".join('"' + column.replace('"', '""') + '"' for column in columns)
                connection.execute(f'INSERT OR REPLACE INTO "{table}" ({quoted}) VALUES ({placeholders})', [enriched[column] for column in columns])
        connection.commit()
        for table in CANONICAL_TABLES:
            count = connection.execute(f'SELECT COUNT(*) FROM "{table}" WHERE novel_id = ? AND snapshot_id = ?', (self.snapshot.novel_id, snapshot_id)).fetchone()[0]
            self.assertEqual(len(self.snapshot.tables[table]), count, table)

    def test_default_series_discovery_is_not_hard_coded_to_one_novel(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            series_root = Path(temp_dir) / "id"
            for slug in ("series-a", "series-b"):
                root = series_root / slug
                (root / "chapters").mkdir(parents=True)
                (root / "NOVEL.md").write_text(f"# {slug}\n", encoding="utf-8")
                (root / "chapter-index.md").write_text(
                    "| Number | Chapter | Status | Update | Metadata | Recap |\n"
                    "|---:|---|---|---|---|---|\n"
                    "| 1 | [Bab 1](chapters/001-start.md) | translated | final | reviewed | [Recap](recaps/001-start.md) |\n",
                    encoding="utf-8",
                )
                (root / "chapters" / "001-start.md").write_text("# Bab 1 — Start\n\nText.\n", encoding="utf-8")
            self.assertEqual(["series-a", "series-b"], [path.name for path in discover_series_dirs(series_root)])

    def test_validate_can_process_multiple_series_in_one_run(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            roots = []
            for slug in ("series-a", "series-b"):
                root = Path(temp_dir) / slug
                (root / "chapters").mkdir(parents=True)
                (root / "NOVEL.md").write_text(f"# {slug}\n", encoding="utf-8")
                (root / "chapter-index.md").write_text(
                    "| Number | Chapter | Status | Update | Metadata | Recap |\n"
                    "|---:|---|---|---|---|---|\n"
                    "| 1 | [Bab 1](chapters/001-start.md) | translated | final | reviewed | |\n",
                    encoding="utf-8",
                )
                (root / "chapters" / "001-start.md").write_text("# Bab 1 — Start\n\nText.\n", encoding="utf-8")
                roots.append(str(root))
            output = io.StringIO()
            with redirect_stdout(output):
                result = main([*roots, "--validate"])
            self.assertEqual(0, result)
            self.assertIn("Discovered 2 series: series-a, series-b", output.getvalue())
            self.assertIn("Validation complete for 2 series", output.getvalue())


if __name__ == "__main__":
    unittest.main()
