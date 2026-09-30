from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

from src.domains.ids import (
    stable_arc_id,
    stable_entity_id,
    stable_glossary_id,
    stable_relationship_id,
    stable_term_id,
)
logger = logging.getLogger(__name__)
TRACE = 5

from src.domains.models import (
    ArcSnapshot,
    ChapterMetadata,
    ContextPacket,
    EntitySnapshot,
    GlossarySnapshot,
    RelationshipSnapshot,
    StyleProfile,
    TerminologySnapshot,
)


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _mapping(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _string_tuple(value: Any) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        values = [value]
    elif isinstance(value, (list, tuple, set)):
        values = list(value)
    else:
        return ()
    out: list[str] = []
    for item in values:
        text = _text(item)
        if text and text not in out:
            out.append(text)
    return tuple(out)


def _optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_id(raw: str) -> str:
    return raw.strip().lower().replace(" ", "-")


class MetadataNormalizer:
    """Converts tolerant LLM JSON into strict domain snapshots."""

    def normalize(
        self,
        payload: Mapping[str, Any],
        *,
        chapter_number: int,
        context: ContextPacket,
    ) -> ChapterMetadata:
        logger.debug("Normalizing metadata chapter=%d payload_keys=%s", chapter_number, sorted(str(k) for k in payload.keys()))
        entities: list[EntitySnapshot] = []
        ref_map = dict(context.entity_reference_map)

        raw_entities = payload.get("entities") or []
        if isinstance(raw_entities, list):
            for item in raw_entities:
                if not isinstance(item, Mapping):
                    continue
                entity_type = _text(item.get("type") or item.get("entity_type") or "entity")
                source_name = _text(item.get("source_name") or item.get("name"))
                canonical_name = _text(item.get("canonical_name") or item.get("translated_name") or source_name)
                raw_id = _text(item.get("entity_id") or item.get("id"))
                entity_id = _normalize_id(raw_id) if ":" in raw_id else stable_entity_id(entity_type, source_name, canonical_name)
                aliases = _string_tuple(item.get("aliases"))
                entity = EntitySnapshot(
                    entity_id=entity_id,
                    entity_type=entity_type or "entity",
                    source_name=source_name or canonical_name,
                    canonical_name=canonical_name or source_name,
                    aliases=aliases,
                    description=_text(item.get("description")),
                    biography=_mapping(item.get("biography") or item.get("biodata")),
                    appearance=_mapping(item.get("appearance")),
                    behavior=_mapping(item.get("behavior")),
                    characteristics=_mapping(item.get("characteristics")),
                    first_seen_chapter=_optional_int(item.get("first_seen_chapter") or item.get("first_seen")) or chapter_number,
                )
                entities.append(entity)
                for ref in (entity.entity_id, entity.source_name, entity.canonical_name, *entity.aliases):
                    if ref:
                        ref_map[ref.casefold()] = entity.entity_id

        def resolve_entity(reference: Any) -> str:
            raw = _text(reference)
            if not raw:
                return ""
            if ":" in raw and " " not in raw:
                return _normalize_id(raw)
            known = ref_map.get(raw.casefold())
            if known:
                return known
            return stable_entity_id("entity", raw, raw)

        relationships: list[RelationshipSnapshot] = []
        raw_relationships = payload.get("relationships") or []
        if isinstance(raw_relationships, list):
            for item in raw_relationships:
                if not isinstance(item, Mapping):
                    continue
                source = resolve_entity(item.get("source_entity_id") or item.get("source") or item.get("from"))
                target = resolve_entity(item.get("target_entity_id") or item.get("target") or item.get("to"))
                if not source or not target or source == target:
                    continue
                direction = _text(item.get("direction") or "directed").lower()
                if direction not in {"directed", "bidirectional"}:
                    direction = "directed"
                relationship_id = _text(item.get("relationship_id") or item.get("id"))
                if not relationship_id.startswith("rel:"):
                    relationship_id = stable_relationship_id(source, target, direction)
                relationships.append(
                    RelationshipSnapshot(
                        relationship_id=relationship_id,
                        source_entity_id=source,
                        target_entity_id=target,
                        name=_text(item.get("name") or item.get("relationship") or item.get("relation")) or "related",
                        description=_text(item.get("description") or item.get("reason")),
                        direction=direction,
                        status=_text(item.get("status") or "active").lower(),
                    )
                )

        terminology: list[TerminologySnapshot] = []
        raw_terms = payload.get("terminology") or []
        if isinstance(raw_terms, list):
            for item in raw_terms:
                if not isinstance(item, Mapping):
                    continue
                source_term = _text(item.get("source_term") or item.get("term"))
                canonical_term = _text(item.get("canonical_term") or item.get("translation") or source_term)
                if not source_term:
                    continue
                term_id = _text(item.get("term_id") or item.get("id"))
                if not term_id.startswith("term:"):
                    term_id = stable_term_id(source_term)
                rule = _text(item.get("translation_rule") or item.get("rule") or "preserve").lower()
                if rule not in {"preserve", "translate", "transliterate", "contextual"}:
                    rule = "contextual"
                terminology.append(
                    TerminologySnapshot(
                        term_id=term_id,
                        source_term=source_term,
                        canonical_term=canonical_term or source_term,
                        category=_text(item.get("category") or item.get("type")),
                        translation_rule=rule,
                        description=_text(item.get("description")),
                        notes=_text(item.get("notes")),
                    )
                )

        glossary: list[GlossarySnapshot] = []
        raw_glossary = payload.get("glossary") or payload.get("glossarium") or []
        if isinstance(raw_glossary, list):
            for item in raw_glossary:
                if not isinstance(item, Mapping):
                    continue
                term = _text(item.get("term") or item.get("canonical_term") or item.get("name"))
                definition = _text(item.get("definition") or item.get("description") or item.get("meaning"))
                if not term or not definition:
                    continue
                glossary_id = _text(item.get("glossary_id") or item.get("id"))
                if not glossary_id.startswith("glossary:"):
                    glossary_id = stable_glossary_id(term)
                glossary.append(
                    GlossarySnapshot(
                        glossary_id=glossary_id,
                        term=term,
                        definition=definition,
                        category=_text(item.get("category") or item.get("type")),
                        aliases=_string_tuple(item.get("aliases")),
                        notes=_text(item.get("notes")),
                    )
                )

        arcs: list[ArcSnapshot] = []
        raw_arcs = payload.get("arcs") or []
        if isinstance(raw_arcs, list):
            for item in raw_arcs:
                if not isinstance(item, Mapping):
                    continue
                name = _text(item.get("name") or item.get("title"))
                if not name:
                    continue
                arc_id = _text(item.get("arc_id") or item.get("id"))
                if not arc_id.startswith("arc:"):
                    arc_id = stable_arc_id(name)
                status = _text(item.get("status") or "active").lower()
                if status not in {"introduced", "active", "paused", "closed"}:
                    status = "active"
                arcs.append(
                    ArcSnapshot(
                        arc_id=arc_id,
                        name=name,
                        status=status,
                        summary=_text(item.get("summary")),
                        chapter_role=_text(item.get("chapter_role") or item.get("role")),
                        start_chapter=_optional_int(item.get("start_chapter")) or chapter_number,
                        end_chapter=_optional_int(item.get("end_chapter")),
                    )
                )

        style_raw = payload.get("style") or payload.get("style_profile") or {}
        style_map = _mapping(style_raw)
        voice_raw = style_map.get("character_voice_rules") or style_map.get("character_voices") or {}
        voice_map = {str(k): _text(v) for k, v in _mapping(voice_raw).items() if _text(v)}
        style = StyleProfile(
            narration_pov=_text(style_map.get("narration_pov") or style_map.get("pov")),
            tense=_text(style_map.get("tense")),
            register=_text(style_map.get("register")),
            dialogue_style=_text(style_map.get("dialogue_style")),
            honorific_policy=_text(style_map.get("honorific_policy")),
            punctuation=_text(style_map.get("punctuation")),
            prose_rhythm=_text(style_map.get("prose_rhythm")),
            character_voice_rules=voice_map,
            do_not_change=_string_tuple(style_map.get("do_not_change") or style_map.get("fixed_rules")),
            notes=_text(style_map.get("notes")),
        )

        quality_flags = _string_tuple(payload.get("quality_flags") or payload.get("quality_issues"))
        logger.debug(
            "Metadata normalization chapter=%d raw_counts entities=%s relationships=%s terminology=%s glossary=%s arcs=%s normalized_counts=%d/%d/%d/%d/%d flags=%d",
            chapter_number,
            len(raw_entities) if isinstance(raw_entities, list) else "invalid",
            len(raw_relationships) if isinstance(raw_relationships, list) else "invalid",
            len(raw_terms) if isinstance(raw_terms, list) else "invalid",
            len(raw_glossary) if isinstance(raw_glossary, list) else "invalid",
            len(raw_arcs) if isinstance(raw_arcs, list) else "invalid",
            len(entities), len(relationships), len(terminology), len(glossary), len(arcs), len(quality_flags),
        )
        logger.log(TRACE, "Normalized entity ids=%s", [x.entity_id for x in entities])
        logger.log(TRACE, "Normalized relationship ids=%s", [x.relationship_id for x in relationships])
        return ChapterMetadata(
            chapter_title=_text(payload.get("chapter_title") or payload.get("title")),
            summary=_text(payload.get("summary")),
            entities=tuple(self._dedupe(entities, lambda x: x.entity_id)),
            relationships=tuple(self._dedupe(relationships, lambda x: x.relationship_id)),
            terminology=tuple(self._dedupe(terminology, lambda x: x.term_id)),
            glossary=tuple(self._dedupe(glossary, lambda x: x.glossary_id)),
            arcs=tuple(self._dedupe(arcs, lambda x: x.arc_id)),
            style=style,
            quality_flags=quality_flags,
        )

    @staticmethod
    def _dedupe(items: list[Any], key) -> list[Any]:
        out: dict[str, Any] = {}
        for item in items:
            out[key(item)] = item
        return list(out.values())
