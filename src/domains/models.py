from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class RawChapter:
    novel_id: str
    chapter_number: int
    path: Path
    source_text: str
    source_hash: str
    title: str = ""


@dataclass(frozen=True, slots=True)
class PreviousChapter:
    chapter_number: int
    title: str
    translation: str
    summary: str


@dataclass(frozen=True, slots=True)
class EntitySnapshot:
    entity_id: str
    entity_type: str
    source_name: str
    canonical_name: str
    aliases: tuple[str, ...] = ()
    description: str = ""
    biography: dict[str, Any] = field(default_factory=dict)
    appearance: dict[str, Any] = field(default_factory=dict)
    behavior: dict[str, Any] = field(default_factory=dict)
    characteristics: dict[str, Any] = field(default_factory=dict)
    first_seen_chapter: int | None = None


@dataclass(frozen=True, slots=True)
class RelationshipSnapshot:
    relationship_id: str
    source_entity_id: str
    target_entity_id: str
    name: str
    description: str
    direction: str = "directed"
    status: str = "active"


@dataclass(frozen=True, slots=True)
class TerminologySnapshot:
    term_id: str
    source_term: str
    canonical_term: str
    category: str = ""
    translation_rule: str = "preserve"
    description: str = ""
    notes: str = ""


@dataclass(frozen=True, slots=True)
class GlossarySnapshot:
    glossary_id: str
    term: str
    definition: str
    category: str = ""
    aliases: tuple[str, ...] = ()
    notes: str = ""


@dataclass(frozen=True, slots=True)
class ArcSnapshot:
    arc_id: str
    name: str
    status: str
    summary: str
    chapter_role: str = ""
    start_chapter: int | None = None
    end_chapter: int | None = None


@dataclass(frozen=True, slots=True)
class StyleProfile:
    narration_pov: str = ""
    tense: str = ""
    register: str = ""
    dialogue_style: str = ""
    honorific_policy: str = ""
    punctuation: str = ""
    prose_rhythm: str = ""
    character_voice_rules: dict[str, str] = field(default_factory=dict)
    do_not_change: tuple[str, ...] = ()
    notes: str = ""


@dataclass(frozen=True, slots=True)
class ChapterMetadata:
    chapter_title: str
    summary: str
    entities: tuple[EntitySnapshot, ...] = ()
    relationships: tuple[RelationshipSnapshot, ...] = ()
    terminology: tuple[TerminologySnapshot, ...] = ()
    glossary: tuple[GlossarySnapshot, ...] = ()
    arcs: tuple[ArcSnapshot, ...] = ()
    style: StyleProfile = field(default_factory=StyleProfile)
    quality_flags: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ContextPacket:
    text: str
    estimated_tokens: int
    included_previous_chapters: tuple[int, ...]
    relevant_entity_ids: tuple[str, ...] = ()
    relevant_term_ids: tuple[str, ...] = ()
    entity_reference_map: dict[str, str] = field(default_factory=dict)
    context_fingerprint: str = ""


@dataclass(frozen=True, slots=True)
class TranslationResult:
    raw_chapter: RawChapter
    translated_text: str
    metadata: ChapterMetadata
    context_fingerprint: str
    model: str
    prompt_version: str
