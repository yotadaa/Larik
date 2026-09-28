# Source audit and preservation — 2026-09-28

The uploaded `app-3.zip` was extracted into an isolated working directory. The original upload was not
modified.

## Markdown read pass

The application contains 1,442 readable Markdown files (about 646k lines / 25 MB of Markdown text).
All were decoded/read during the audit pass.

The metadata-specific pass then inspected every root Markdown file under:

```text
id/a-regressors-tale-of-cultivation/
```

while deliberately excluding `chapters/` and `recaps/`, as requested. That root contains 23 Markdown
documents, including the metadata-v2 registries (`entities.md`, `aliases.md`, `relationships.md`,
`facts.md`, `events.md`, `states.md`, `scenes.md`, `arcs.md`, `cycles.md`, `characteristics.md`) plus
translation/reference memory (`characters.md`, `continuity.md`, `glossarium.md`, `locations.md`,
`qa-log.md`, `terminology.md`, `chapter-index.md`, and project guidance documents).

## Current corpus state

- Actual chapter files: 182.
- Actual recap files: 181.
- Chapter-index rows: 200.
- Metadata status in the index: 163 reviewed, 37 unreviewed/planned.
- Actual reviewed boundary: chapter 163.

The chapter index contains future planning rows through chapter 200; the synchronizer does not invent
missing chapter content for rows 183–200.

## Source inconsistencies retained as warnings

The parser currently reports 74 warnings and zero errors. Examples include:

- chapter-index filename mismatches (for example chapter 35),
- a recap-path mismatch around chapter 58,
- no matching recap file for actual chapter 182,
- duplicate entity IDs in `entities.md`,
- unresolved entity/fact/event/scene references,
- unresolved evidence wikilinks that no longer match an actual chapter filename.

These are stored in `metadata_integrity_issues`. They are not silently fixed because doing so could
change story meaning or provenance.

## Packaging boundary

The uploaded ZIP already contained many Git-dirty and untracked files. Therefore the changed-files
package for this task is calculated by comparing file hashes against the extracted upload, not by
using `git status`. This prevents unrelated pre-existing work from being included accidentally.
