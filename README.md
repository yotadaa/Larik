# Larik Sequential Novel Translator

Python pipeline for translating many novel series **chapter-by-chapter** while preserving terminology, entity knowledge, relationship evolution, story arcs, and translation style in SQLite.

The implementation follows Clean Architecture. Raw source chapters remain files under `story/raw/{novel_id}`, while **translations and metadata are stored in SQLite**.

## Why this version is simpler

The previous metadata model had many ledgers (facts, events, scenes, cycles, characters, locations, continuity, QA, etc.). This version intentionally keeps only what materially helps translation quality or the requested visualizations:

- translated chapters + continuity summary;
- entities (characters are just one entity type);
- entity-to-entity relationships, versioned per chapter;
- terminology (translation contract);
- glossary (in-world meaning);
- arcs;
- style/voice contract.

Every runtime/content table is scoped by `novel_id` and `lang_id`, so one database can safely host many novels and target languages.

## Folder layout

```text
.
├── main.py
├── requirements.txt
├── .env.example
├── story/
│   └── raw/
│       └── {novel_id}/
│           └── chapters/          # nested or direct .md/.txt both supported
├── src/
│   ├── domains/                   # pure data models + stable IDs
│   ├── applications/
│   │   ├── ports/                 # repository/source/LLM interfaces
│   │   ├── services/              # context, prompts, metadata normalization, QA
│   │   └── use_cases/             # sequential translation orchestration
│   ├── infrastructures/
│   │   ├── config/                # .env adapter
│   │   ├── database/              # SQLite adapter/schema
│   │   ├── llm/                   # OpenAI-compatible adapter
│   │   └── repositories/          # filesystem raw-story adapter
│   └── presentations/             # CLI
├── scripts/
│   └── translate.py               # one-chapter compatibility wrapper
└── tests/
```

Dependency direction is inward: infrastructure implements application ports; application code does not depend on OpenAI or SQLite directly.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env
```

Fill at least:

```dotenv
BASE_URL=https://api.openai.com/v1
API_KEY=...
MODEL=...
MAX_TOKENS=8192
CONTEXT_WINDOW=128000
COMPACT_THRESHOLD=0.80
```

The requested camelCase-style concepts are supported through the normal environment variables above. The loader also accepts aliases such as `baseUrl`, `apiKey`, `maxTokens`, `contextWindow`, and `compactThreshold`.

## Raw novel input

Preferred structure:

```text
story/raw/a-regressors-tale-of-cultivation/chapters/
  a-regressors-tale-of-cultivation-chapter-1.md
  a-regressors-tale-of-cultivation-chapter-2.md
```

Files may also be placed directly under `story/raw/{novel_id}`. Supported extensions are `.md` and `.txt`. Chapter numbers are detected from names like `chapter-12`, `chapters-12`, `ch-12`, or a leading number.

## Commands

List all raw series:

```bash
python main.py list
```

Initialize SQLite:

```bash
python main.py init-db
```

Translate sequentially:

```bash
python main.py translate a-regressors-tale-of-cultivation --lang id --start 1 --end 10
```

Process only one chapter:

```bash
python scripts/translate.py a-regressors-tale-of-cultivation 1 --lang-target id
```

Resume safely across the whole available range:

```bash
python main.py translate a-regressors-tale-of-cultivation --lang id
```

Current chapters with unchanged source hash + model + prompt version are skipped. Use `--force` to rebuild them.

Show database counts:

```bash
python main.py status a-regressors-tale-of-cultivation --lang id
```

## Sequential workflow

For each selected chapter, the application executes in this exact order:

1. Read the raw chapter from `story/raw/{novel_id}`.
2. If the stored source/model/prompt is still current, skip it.
3. Read up to `PREVIOUS_CHAPTERS` completed earlier chapters.
4. Select only metadata relevant to the current source plus recent continuity.
5. Build a bounded context using the configured `CONTEXT_WINDOW` and `COMPACT_THRESHOLD`.
6. Ask the LLM for the translation only.
7. Run fast deterministic quality checks.
8. Ask the LLM once for compact structured metadata based on the source + final translation.
9. In `QUALITY_REVIEW=adaptive`, call the LLM repair pass only when a concrete issue was found; then re-extract metadata for the repaired final text.
10. Commit the translation and all metadata snapshots in one SQLite transaction.
11. Only then proceed to the next chapter.

No chapter translations are parallelized across chapter boundaries. This protects continuity. Speed comes from **context selection, compaction, skip/resume behavior, minimal metadata, WAL SQLite, and avoiding a mandatory reviewer call**.

## Relationship evolution

`relationships` is temporal. The same relationship ID represents the same entity pair; each changed/observed state is stored at a chapter number:

```text
chapter 10: A <-> B = strangers
chapter 18: A <-> B = cautious allies
chapter 34: A <-> B = trusted companions
chapter 57: A <-> B = enemies
```

Each snapshot stores both:

- `name` — the relationship label;
- `description` — why the relationship has that state at/by that chapter.

The source and target may be **any entities**: character↔character, character↔location, organization↔location, character↔item, item↔concept, etc.

## Entity model

There is no separate character metadata file/table. `entities` supports:

- character;
- location;
- organization/faction;
- item/object;
- technique/ability;
- realm/rank;
- concept;
- anything else the story treats as a meaningful entity.

Character-specific data such as biography, appearance, behavior, and characteristics live in flexible JSON fields on the entity snapshot.

## Terminology vs glossary

`terminology` answers: **How must this source term be translated?**

`glossary` answers: **What does this in-world concept mean?**

Keeping them separate prevents lore descriptions from bloating the high-priority translation contract.

## Context optimization

The pipeline never dumps the entire database into the prompt. For chapter N it prioritizes:

1. latest style contract;
2. canonical terms found in the current raw source;
3. entities found in the current source or recently active;
4. relationship state for those entities/recent chapters;
5. active arcs;
6. summaries of the previous N chapters;
7. full text of only the latest `PREVIOUS_FULL_CHAPTERS` translated chapters.

Low-priority sections are compacted first when the context approaches the configured threshold.

## Downstream invalidation

A subtle consistency problem is handled automatically: if chapter 20 changes, chapters 21+ were translated with now-obsolete context.

When an upstream chapter is rewritten, the repository marks all later translations `stale=1`. They stop contributing to context and will be regenerated sequentially. This prevents a partially refreshed corpus from silently mixing old and new continuity.

## Tests

```bash
python -m unittest discover -s tests -v
```

The suite covers sequential persistence, relationship history, context reuse, skip/resume behavior, downstream invalidation, and raw chapter discovery.

See `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, and `DATABASE.md` for the design details.
