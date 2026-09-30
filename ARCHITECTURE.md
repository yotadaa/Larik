# Clean Architecture

## Dependency rule

```text
Presentation (CLI)
        |
        v
Application / Use Cases ----> Domain
        ^
        |
Infrastructure adapters
(SQLite / filesystem / OpenAI-compatible API)
```

The application layer defines ports. Infrastructure implements them.

### Domain

`src/domains/`

Contains only stable business concepts:

- raw chapter;
- previous chapter context;
- entity snapshot;
- relationship snapshot;
- terminology/glossary;
- arc snapshot;
- style profile;
- translation result;
- deterministic stable-ID helpers.

It imports neither SQLite nor the OpenAI SDK.

### Application

`src/applications/`

`ports/` declares interfaces for the LLM, raw source, and repository.

`services/` contains:

- `ContextBuilder`: retrieves/selects/compacts only relevant continuity;
- `TranslationQualityChecker`: cheap deterministic checks;
- `MetadataNormalizer`: converts tolerant LLM JSON to strict domain snapshots;
- prompts/token budget helpers.

`use_cases/TranslateSeries` owns the sequential workflow. It only knows the ports.

### Infrastructure

`src/infrastructures/`

- `config/settings.py` maps `.env` to application settings;
- `repositories/raw_story_repository.py` maps `story/raw/...` to `RawChapter`;
- `database/repository.py` implements temporal SQLite persistence;
- `llm/openai_service.py` implements the LLM port using an OpenAI-compatible Chat Completions endpoint.

### Presentation

`src/presentations/cli.py` wires the adapters and use case. It contains no translation rules or SQL.

## Normal chapter call budget

The normal path uses **two LLM calls per chapter**:

```text
Call 1: source + selected context -> final translation
Call 2: source + translation + compact context -> metadata JSON
```

A third repair call (followed by one metadata refresh) occurs only when `QUALITY_REVIEW=adaptive` finds a concrete issue, or always when `QUALITY_REVIEW=always`.

This is deliberately faster than a translator + reviewer + extractor pipeline for every chapter while still preserving a quality escape hatch.

## Temporal snapshot pattern

Instead of many specialized ledgers, the core metadata tables are chapter-versioned.

For an entity or term, “current state as of chapter N” means:

```sql
MAX(chapter_number) <= N for the same stable ID
```

This gives history without separate history tables and makes visualizations naturally chapter-aware.

## Why no parallel chapter translation

Chapter N+1 depends on the final translation and metadata from N. Translating chapters concurrently can produce inconsistent names, terminology, relationship states, and voice decisions.

Therefore chapter execution is intentionally sequential. Optimizations are applied around it rather than breaking the dependency:

- numeric raw-file discovery;
- minimal DB reads;
- relevance filtering;
- token-budget compaction;
- idempotent skips;
- optional instead of mandatory LLM repair;
- SQLite WAL and atomic writes.
