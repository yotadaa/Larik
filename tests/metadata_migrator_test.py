from __future__ import annotations

import sqlite3
import unittest
from pathlib import Path

from database.migrator import CANONICAL_TABLES, ROOT, SnapshotBuilder


NOVEL_DIR = ROOT / "id" / "a-regressors-tale-of-cultivation"


class MetadataMigratorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot = SnapshotBuilder(NOVEL_DIR).build()

    def test_current_workspace_parses_without_validation_errors(self):
        self.assertEqual(23, len(self.snapshot.documents))
        self.assertEqual(182, self.snapshot.actual_chapter_count)
        self.assertEqual(181, len(self.snapshot.recaps))
        self.assertEqual(163, self.snapshot.reviewed_through)
        self.assertFalse([issue for issue in self.snapshot.issues if issue.severity == "error"])
        self.assertTrue(any(issue.code == "chapter_recap_missing" for issue in self.snapshot.issues))
        self.assertTrue(any(issue.code == "duplicate_entity_id" for issue in self.snapshot.issues))

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


if __name__ == "__main__":
    unittest.main()
