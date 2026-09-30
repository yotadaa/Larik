# Implementation Plan and Extended Design

## Goal

Build a reusable Python translator for many serialized novels, not a one-series script. The system must preserve literary consistency while keeping metadata deliberately small and queryable.

## Core decisions

### 1. Sequential chapter compiler

Each chapter is treated like a deterministic compilation unit:

```text
raw source
  + previous chapter memory
  + metadata as-of previous chapter
  + style contract
        ↓
translation
        ↓
compact metadata extraction
        ↓
atomic SQLite commit
        ↓
next chapter
```

A chapter is never considered complete until its translation and metadata commit together.

### 2. Temporal metadata rather than dozens of ledgers

The metadata model is reduced to seven content concerns:

- chapter;
- entity;
- relationship;
- terminology;
- glossary;
- arc;
- style profile.

Each concern is versioned by chapter. This is enough for translation memory and chapter-by-chapter visualization without maintaining separate character/fact/event/state/scene files.

### 3. Universal entity graph

Everything meaningful can be an entity. This avoids artificial boundaries and lets the same graph represent:

- character → organization membership;
- character → item ownership;
- organization → location control;
- item → concept connection;
- location → location containment;
- character → character social relations.

### 4. Pair-stable relationship identity

A relationship ID is based on the two entity IDs, not its current label. This means the relationship can evolve while retaining a stable visual edge.

The snapshot stores direction, current name, explanation, and status.

### 5. Translation memory is selected, not dumped

For every chapter, candidate metadata is ranked by:

- literal source/canonical-name match in the new raw chapter;
- source terminology match;
- recent activity in the previous N chapters.

This keeps prompt size roughly related to the current chapter rather than total novel length.

### 6. Style is a first-class contract

The latest style profile is always high-priority context. It records narration POV/tense/register, dialogue handling, honorific policy, prose rhythm, character voice constraints, and fixed “do not change” rules.

### 7. Downstream dependency invalidation

Rebuilding an old chapter invalidates all later translations because their context depended on it. Future rows are marked stale, excluded from context, and rebuilt sequentially.

### 8. Adaptive quality instead of mandatory review

Default `QUALITY_REVIEW=adaptive`:

- always run cheap deterministic checks;
- let metadata extraction report concrete quality flags;
- pay for a repair LLM call only when needed.

Use `QUALITY_REVIEW=always` for maximum review depth, or `off` for fastest bulk processing.

## Future extensions that fit this architecture

These can be added later without changing the core schema:

- relationship graph API with `as_of_chapter` filtering;
- entity timeline UI by selecting snapshots over chapters;
- terminology conflict detector;
- batch export from SQLite to Markdown/EPUB;
- provider-specific LLM adapters;
- embedding-based metadata retrieval if exact matching eventually becomes insufficient;
- human review queue for chapters with repeated quality flags;
- per-language style profiles for one novel translated into multiple target languages.

Avoid adding new metadata tables unless the feature cannot be represented by the existing temporal snapshots.
