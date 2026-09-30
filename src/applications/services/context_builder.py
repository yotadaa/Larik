from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import asdict, dataclass

from src.applications.ports.repositories import StoryRepository
from src.applications.services.token_budget import estimate_tokens, trim_text_to_tokens
from src.domains.exceptions import ContextWindowError
from src.domains.models import ContextPacket, RawChapter

logger = logging.getLogger(__name__)
TRACE = 5


@dataclass(frozen=True, slots=True)
class ContextSettings:
    previous_chapters: int = 3
    previous_full_chapters: int = 1
    context_window: int = 128000
    max_output_tokens: int = 8192
    compact_threshold: float = 0.80
    safety_margin_tokens: int = 2048
    prompt_reserve_tokens: int = 2500
    entity_limit: int = 80
    relationship_limit: int = 120
    terminology_limit: int = 120
    glossary_limit: int = 80
    arc_limit: int = 12

    @property
    def safe_total_tokens(self) -> int:
        return int(self.context_window * self.compact_threshold)


class ContextBuilder:
    """Builds a bounded context packet without loading the full story history."""

    def __init__(self, repository: StoryRepository, settings: ContextSettings):
        self.repository = repository
        self.settings = settings

    def build(self, chapter: RawChapter, lang_id: str) -> ContextPacket:
        before = chapter.chapter_number
        recent_from = max(1, before - self.settings.previous_chapters)
        logger.debug(
            "Context build start novel=%s lang=%s chapter=%d previous_chapters=%d previous_full=%d recent_from=%d",
            chapter.novel_id, lang_id, before, self.settings.previous_chapters,
            self.settings.previous_full_chapters, recent_from,
        )
        logger.log(
            TRACE,
            "Context limits entity=%d relationship=%d terminology=%d glossary=%d arc=%d",
            self.settings.entity_limit, self.settings.relationship_limit, self.settings.terminology_limit,
            self.settings.glossary_limit, self.settings.arc_limit,
        )
        previous = self.repository.previous_chapters(
            chapter.novel_id,
            lang_id,
            before,
            self.settings.previous_chapters,
        )
        style = self.repository.latest_style(chapter.novel_id, lang_id, before)
        entities = self.repository.relevant_entities(
            chapter.novel_id,
            lang_id,
            before,
            chapter.source_text,
            recent_from_chapter=recent_from,
            limit=self.settings.entity_limit,
        )
        entity_ids = [item.entity_id for item in entities]
        relationships = self.repository.relevant_relationships(
            chapter.novel_id,
            lang_id,
            before,
            entity_ids,
            recent_from_chapter=recent_from,
            limit=self.settings.relationship_limit,
        )
        terminology = self.repository.relevant_terminology(
            chapter.novel_id,
            lang_id,
            before,
            chapter.source_text,
            recent_from_chapter=recent_from,
            limit=self.settings.terminology_limit,
        )
        glossary = self.repository.relevant_glossary(
            chapter.novel_id,
            lang_id,
            before,
            chapter.source_text,
            recent_from_chapter=recent_from,
            limit=self.settings.glossary_limit,
        )
        arcs = self.repository.active_arcs(
            chapter.novel_id,
            lang_id,
            before,
            self.settings.arc_limit,
        )

        logger.debug(
            "Context retrieval previous=%d style=%s entities=%d relationships=%d terminology=%d glossary=%d arcs=%d",
            len(previous), "yes" if style else "no", len(entities), len(relationships),
            len(terminology), len(glossary), len(arcs),
        )
        logger.log(TRACE, "Previous chapter ids: %s", [x.chapter_number for x in previous])
        logger.log(TRACE, "Selected entity ids: %s", [x.entity_id for x in entities])
        logger.log(TRACE, "Selected relationship ids: %s", [x.relationship_id for x in relationships])
        logger.log(TRACE, "Selected terminology ids: %s", [x.term_id for x in terminology])
        logger.log(TRACE, "Selected glossary ids: %s", [x.glossary_id for x in glossary])
        logger.log(TRACE, "Selected arc ids: %s", [x.arc_id for x in arcs])

        source_tokens = estimate_tokens(chapter.source_text)
        available = (
            self.settings.safe_total_tokens
            - self.settings.max_output_tokens
            - self.settings.safety_margin_tokens
            - self.settings.prompt_reserve_tokens
            - source_tokens
        )
        logger.debug(
            "Token budget context_window=%d threshold=%.2f safe_total=%d source=%d output_reserve=%d safety_margin=%d prompt_reserve=%d metadata_context_budget=%d",
            self.settings.context_window, self.settings.compact_threshold, self.settings.safe_total_tokens,
            source_tokens, self.settings.max_output_tokens, self.settings.safety_margin_tokens,
            self.settings.prompt_reserve_tokens, available,
        )
        if available < 256:
            raise ContextWindowError(
                f"Chapter {chapter.chapter_number} source is too large for configured contextWindow="
                f"{self.settings.context_window}. Increase CONTEXT_WINDOW, lower MAX_TOKENS, or split the raw chapter."
            )

        sections: list[tuple[str, str, int]] = []
        if style:
            sections.append(("STYLE CONTRACT", json.dumps(asdict(style), ensure_ascii=False, indent=2), 1))
        if terminology:
            sections.append(("CANONICAL TERMINOLOGY", json.dumps([asdict(x) for x in terminology], ensure_ascii=False), 1))
        if entities:
            sections.append(("RELEVANT ENTITIES", json.dumps([asdict(x) for x in entities], ensure_ascii=False), 2))
        if relationships:
            sections.append(("RELATIONSHIP STATE", json.dumps([asdict(x) for x in relationships], ensure_ascii=False), 3))
        if glossary:
            sections.append(("GLOSSARY", json.dumps([asdict(x) for x in glossary], ensure_ascii=False), 3))
        if arcs:
            sections.append(("ACTIVE ARCS", json.dumps([asdict(x) for x in arcs], ensure_ascii=False), 2))

        if previous:
            summary_lines = []
            for item in previous:
                summary_lines.append(
                    f"Chapter {item.chapter_number} — {item.title or '(untitled)'}\n{item.summary.strip()}"
                )
            sections.append(("PREVIOUS CHAPTER SUMMARIES", "\n\n".join(summary_lines), 1))

            full_count = max(0, min(self.settings.previous_full_chapters, len(previous)))
            if full_count:
                recent_full = previous[-full_count:]
                full_text = "\n\n".join(
                    f"### Previous chapter {x.chapter_number}\n{x.translation}" for x in recent_full
                )
                sections.append(("RECENT TRANSLATION SAMPLE", full_text, 4))

        for title, body, priority in sections:
            logger.log(
                TRACE,
                "Context section title=%r priority=%d chars=%d estimated_tokens=%d",
                title, priority, len(body), estimate_tokens(body),
            )

        # Compact low-priority sections first while preserving the high-value style/terminology contract.
        rendered = self._fit_sections(sections, available)
        included = tuple(x.chapter_number for x in previous)
        rendered_tokens = estimate_tokens(rendered)
        fingerprint = hashlib.sha256(rendered.encode("utf-8")).hexdigest()
        logger.debug(
            "Context finalized chars=%d estimated_tokens=%d budget=%d utilization=%.1f%% fingerprint=%s",
            len(rendered), rendered_tokens, available,
            (rendered_tokens / available * 100.0) if available > 0 else 0.0, fingerprint[:16],
        )
        entity_reference_map: dict[str, str] = {}
        for entity in entities:
            for ref in (entity.entity_id, entity.source_name, entity.canonical_name, *entity.aliases):
                if ref and ref.strip():
                    entity_reference_map[ref.strip().casefold()] = entity.entity_id
        return ContextPacket(
            text=rendered,
            estimated_tokens=rendered_tokens,
            included_previous_chapters=included,
            relevant_entity_ids=tuple(entity_ids),
            relevant_term_ids=tuple(x.term_id for x in terminology),
            entity_reference_map=entity_reference_map,
            context_fingerprint=fingerprint,
        )

    @staticmethod
    def _render_section(title: str, body: str) -> str:
        return f"## {title}\n{body.strip()}" if body.strip() else ""

    def _fit_sections(self, sections: list[tuple[str, str, int]], token_budget: int) -> str:
        if not sections:
            return "No previous translation context exists. Treat this as the series foundation chapter."

        mutable = [[title, body, priority] for title, body, priority in sections]

        def render() -> str:
            return "\n\n".join(
                self._render_section(str(title), str(body)) for title, body, _ in mutable if str(body).strip()
            )

        current = render()
        current_tokens = estimate_tokens(current)
        logger.log(TRACE, "Context pre-compaction tokens=%d budget=%d", current_tokens, token_budget)
        if current_tokens <= token_budget:
            logger.log(TRACE, "Context fits without compaction")
            return current
        logger.debug("Context exceeds budget by %d tokens; compaction begins", current_tokens - token_budget)

        # Each pass aggressively shrinks the least important section.
        for priority in (4, 3, 2, 1):
            for section in mutable:
                if section[2] != priority or not str(section[1]).strip():
                    continue
                total = estimate_tokens(render())
                if total <= token_budget:
                    return render()
                body_tokens = estimate_tokens(str(section[1]))
                excess = total - token_budget
                target = max(64, body_tokens - max(excess, body_tokens // 3))
                logger.debug(
                    "Compacting section=%r priority=%d body_tokens=%d target_tokens=%d excess_total=%d keep_tail=%s",
                    section[0], priority, body_tokens, target, excess, priority == 4,
                )
                section[1] = trim_text_to_tokens(str(section[1]), target, keep_tail=priority == 4)

        current = render()
        final_tokens = estimate_tokens(current)
        if final_tokens > token_budget:
            logger.warning(
                "Section compaction was insufficient (%d > %d); applying final whole-context trim",
                final_tokens, token_budget,
            )
            current = trim_text_to_tokens(current, token_budget)
        logger.debug("Context compaction complete final_tokens=%d budget=%d", estimate_tokens(current), token_budget)
        return current
