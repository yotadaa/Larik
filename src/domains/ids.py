from __future__ import annotations

import hashlib
import re
import unicodedata


def slugify(value: str, fallback: str = "unknown") -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-")
    return slug or fallback


def stable_entity_id(entity_type: str, source_name: str, canonical_name: str = "") -> str:
    prefix = slugify(entity_type or "entity", "entity")
    name = source_name.strip() or canonical_name.strip()
    return f"{prefix}:{slugify(name)}"


def stable_term_id(source_term: str) -> str:
    return f"term:{slugify(source_term)}"


def stable_glossary_id(term: str) -> str:
    return f"glossary:{slugify(term)}"


def stable_arc_id(name: str) -> str:
    return f"arc:{slugify(name)}"


def stable_relationship_id(
    source_entity_id: str,
    target_entity_id: str,
    direction: str,
) -> str:
    direction = (direction or "directed").lower().strip()
    source = source_entity_id.strip()
    target = target_entity_id.strip()
    # Relationship identity is pair-based so its name/direction can evolve chapter by chapter.
    # The snapshot itself still preserves source/target/direction for directed semantics.
    source, target = sorted((source, target))
    digest = hashlib.sha1(f"pair|{source}|{target}".encode("utf-8")).hexdigest()[:16]
    return f"rel:{digest}"
