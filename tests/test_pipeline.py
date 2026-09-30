from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from src.applications.services.context_builder import ContextBuilder, ContextSettings
from src.applications.use_cases.preview_queries import PreviewQueries
from src.applications.use_cases.translate_series import TranslateSeries, TranslationWorkflowSettings
from src.domains.models import (
    ArcSnapshot,
    ChapterMetadata,
    EntitySnapshot,
    GlossarySnapshot,
    RelationshipSnapshot,
    StyleProfile,
    TerminologySnapshot,
)
from src.infrastructures.database.repository import SQLiteStoryRepository
from src.infrastructures.repositories.raw_story_repository import FileSystemRawStorySource


class FakeLLM:
    model_name = "fake-model"

    async def translate(self, chapter, context, *, target_language):
        return chapter.source_text.replace("Chapter", "Bab").replace("Hello", "Halo")

    async def extract_metadata(self, chapter, translated_text, context, *, target_language):
        n = chapter.chapter_number
        entities = (
            EntitySnapshot(
                entity_id="character:aria",
                entity_type="character",
                source_name="Aria",
                canonical_name="Aria",
                aliases=(),
                description="Tokoh utama",
                behavior={"tone": "calm" if n == 1 else "determined"},
                first_seen_chapter=1,
            ),
            EntitySnapshot(
                entity_id="location:gate",
                entity_type="location",
                source_name="Gate",
                canonical_name="Gerbang",
                description="Gerbang kota",
                first_seen_chapter=1,
            ),
        )
        return ChapterMetadata(
            chapter_title=f"Bab {n}",
            summary=f"Ringkasan bab {n} untuk kontinuitas.",
            entities=entities,
            relationships=(
                RelationshipSnapshot(
                    relationship_id="rel:aria-gate",
                    source_entity_id="character:aria",
                    target_entity_id="location:gate",
                    name="approaches" if n == 1 else "enters",
                    description=f"Hubungan berubah di bab {n}.",
                ),
            ),
            terminology=(
                TerminologySnapshot("term:mana", "Mana", "Mana", "energy", "preserve", "Energi magis"),
            ),
            glossary=(
                GlossarySnapshot("glossary:mana", "Mana", "Energi yang digunakan dalam dunia cerita."),
            ),
            arcs=(
                ArcSnapshot("arc:arrival", "Arrival", "active", f"Keadaan arc setelah bab {n}", "advance", 1),
            ),
            style=StyleProfile(
                narration_pov="first person",
                tense="present",
                register="natural",
                dialogue_style="concise",
                character_voice_rules={"character:aria": "calm and observant"},
                do_not_change=("Mana",),
            ),
        )

    async def repair_translation(self, chapter, translated_text, context, issues, *, target_language):
        return translated_text


class PipelineTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        raw = self.root / "story" / "raw" / "demo" / "chapters"
        raw.mkdir(parents=True)
        (raw / "demo-chapter-1.md").write_text("# Chapter 1\nHello Aria. Mana. Gate.", encoding="utf-8")
        (raw / "demo-chapter-2.md").write_text("# Chapter 2\nHello Aria enters the Gate. Mana.", encoding="utf-8")
        self.source = FileSystemRawStorySource(self.root / "story" / "raw")
        self.repo = SQLiteStoryRepository(self.root / "story.db")
        self.repo.initialize()

    async def asyncTearDown(self):
        self.repo.close()
        self.tmp.cleanup()

    async def test_sequential_pipeline_persists_temporal_metadata(self):
        builder = ContextBuilder(
            self.repo,
            ContextSettings(
                previous_chapters=3,
                previous_full_chapters=1,
                context_window=16000,
                max_output_tokens=1500,
                safety_margin_tokens=500,
                prompt_reserve_tokens=500,
            ),
        )
        use_case = TranslateSeries(
            source=self.source,
            repository=self.repo,
            llm=FakeLLM(),
            context_builder=builder,
            settings=TranslationWorkflowSettings(review_mode="off", strict_sequential=True),
        )
        summary = await use_case.execute("demo", "id", start=1, end=2)
        self.assertEqual(summary.processed, (1, 2))
        self.assertEqual(self.repo.chapter_count("demo", "id"), 2)

        relationship_rows = self.repo.conn.execute(
            "SELECT chapter_number,name FROM relationships WHERE novel_id='demo' AND lang_id='id' ORDER BY chapter_number"
        ).fetchall()
        self.assertEqual([(r[0], r[1]) for r in relationship_rows], [(1, "approaches"), (2, "enters")])

        latest_style = self.repo.latest_style("demo", "id", 3)
        self.assertIsNotNone(latest_style)
        self.assertEqual(latest_style.narration_pov, "first person")

        ch2_context = builder.build(self.source.read_chapter("demo", 2), "id")
        self.assertIn(1, ch2_context.included_previous_chapters)
        self.assertIn("character:aria", ch2_context.text)

        preview = PreviewQueries(self.repo)
        overview = preview.overview()
        self.assertEqual(overview["novels"][0]["completed"], 2)
        novel = preview.novel("demo", "id")
        self.assertEqual(novel["completed_chapters"], 2)
        chapter = preview.chapter("demo", "id", 2)
        self.assertIsNotNone(chapter)
        self.assertEqual(chapter["chapter_number"], 2)
        atlas = preview.atlas("demo", "id")
        self.assertEqual(len(atlas["entities"]), 2)
        self.assertEqual(len(atlas["relationships"]), 1)

    async def test_rewriting_upstream_marks_future_chapters_stale(self):
        builder = ContextBuilder(
            self.repo,
            ContextSettings(context_window=16000, max_output_tokens=1500, safety_margin_tokens=500, prompt_reserve_tokens=500),
        )
        use_case = TranslateSeries(
            source=self.source,
            repository=self.repo,
            llm=FakeLLM(),
            context_builder=builder,
            settings=TranslationWorkflowSettings(review_mode="off", strict_sequential=True),
        )
        await use_case.execute("demo", "id", start=1, end=2)
        raw1 = self.root / "story" / "raw" / "demo" / "chapters" / "demo-chapter-1.md"
        raw1.write_text("# Chapter 1\nHello Aria changed. Mana. Gate.", encoding="utf-8")
        await use_case.execute("demo", "id", start=1, end=1)
        self.assertTrue(self.repo.has_completed_chapter("demo", "id", 1))
        self.assertFalse(self.repo.has_completed_chapter("demo", "id", 2))

    async def test_same_source_model_prompt_skips_llm_work(self):
        builder = ContextBuilder(
            self.repo,
            ContextSettings(context_window=16000, max_output_tokens=1500, safety_margin_tokens=500, prompt_reserve_tokens=500),
        )
        use_case = TranslateSeries(
            source=self.source,
            repository=self.repo,
            llm=FakeLLM(),
            context_builder=builder,
            settings=TranslationWorkflowSettings(review_mode="off", strict_sequential=True),
        )
        await use_case.execute("demo", "id", start=1, end=1)
        second = await use_case.execute("demo", "id", start=1, end=1)
        self.assertEqual(second.processed, ())
        self.assertEqual(second.skipped, (1,))


class RawSourceTests(unittest.TestCase):
    def test_plural_chapters_filename_is_supported(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "story" / "raw" / "shadow" / "chapters"
            root.mkdir(parents=True)
            (root / "chapters-66.md").write_text("# Chapter 66\nText", encoding="utf-8")
            source = FileSystemRawStorySource(Path(td) / "story" / "raw")
            self.assertEqual(source.list_chapter_numbers("shadow"), [66])
