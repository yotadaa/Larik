# Earlier visualizer research — superseded runtime design

This file is retained as historical research from the first Story Atlas prototype. Its cumulative
mention-edge model and `spoilers=1` gate are **not** the current implementation.

For the current 2026 research, chosen visualizations and spoiler-safe data contract, read:

- `VISUALIZATION_RESEARCH_2026.md`
- `../FEATURE_PLAN.md`
- `../DATABASE.md`

Current runtime rules are stricter: explicit reviewed facts are persisted in D1, every fact has a
chapter reveal boundary, uncovered chapters fail closed, and network/storyline views receive only
rows already safe for the selected chapter.
