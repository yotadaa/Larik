# Test Report — 2026-09-30

## Automated tests

Command:

```bash
python -m unittest discover -s tests -v
```

Result: **4/4 passed**.

Covered behavior:

1. sequential chapter translation writes translation + temporal metadata;
2. relationship history preserves different states across chapters;
3. previous translation/entity metadata is available to the next chapter context;
4. unchanged source/model/prompt is skipped without new LLM work;
5. rebuilding an upstream chapter marks later chapters stale;
6. plural raw naming such as `chapters-66.md` is discovered correctly.

## Static architecture checks

- no `src.infrastructures` imports from `src/applications` or `src/domains`;
- no application/infrastructure/presentation imports from the domain layer;
- all eight runtime tables contain both `novel_id` and `lang_id`.

## Corpus discovery check

The bundled raw corpus is detected as:

- `a-regressors-tale-of-cultivation`: 867 raw chapters;
- `shadow-slave`: 150 raw chapters;
- `the-tale-of-cultivation-and-demon-extermination`: 145 raw chapters.

## Provider integration note

The environment used to build this artifact does not have the `openai` Python package or the user's live LLM credentials configured, so no paid/live translation request was sent. The LLM adapter was compile-checked and the complete use-case was exercised with a deterministic fake adapter. Install `requirements.txt`, create `.env`, then run chapter 1 to perform the live provider smoke test.
