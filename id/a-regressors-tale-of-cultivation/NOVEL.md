# A Regressor’s Tale of Cultivation

- Source language: English
- Target language: Indonesian (`id`)
- Source: We Tried TLS
- Chapter and recap files are maintained under `chapters/` and `recaps/`.
- Regression-cycle coverage currently established: cycles 1–14. Source-audited metadata chapters: 1–2, 154–158, and 164; cycle 14 remains ongoing at Chapter 164.

## Metadata integrity rule

Treat `events.md`, `facts.md`, `states.md`, `relationships.md`, `scenes.md`, `cycles.md`, `arcs.md`, and the memory files as persistent append/history records. Never use whole-file replacement to add a chapter row. Before changing an existing file, read and preserve its contents; use a surgical append/edit for new records. Afterward verify old IDs remain, new IDs are unique, chapter coverage is correct, and evidence links resolve. See `metadata-schema.md` and `qa-log.md` for the recovery incident and required safeguards.

## Recovery notice

An earlier whole-file overwrite left `events.md`, `facts.md`, and `states.md` containing only Chapter 158 rows. Exact operation payloads recovered from session history restored Chapters 154–158. Granular rows for other chapters must not be presumed complete until audited against their source and recap. Chapters 153–157 Indonesian chapter files are currently stubs; their English source files and Indonesian recaps exist.