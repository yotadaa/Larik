# GitNexus — Novel Knowledge Graph

This directory's canonical story metadata lives in the root registries: [entity registry](entities.md), [relationships](relationships.md), [aliases](aliases.md), [facts](facts.md), [events](events.md), [states](states.md), [scenes](scenes.md), [arcs](arcs.md), and [regression cycles](cycles.md). The full field, provenance, spoiler, and ID contract is in [metadata schema](metadata-schema.md). Character, location, terminology, and continuity context lives in [character memory](characters.md), [location memory](locations.md), [terminology](terminology.md), [glossary](glossarium.md), and [continuity](continuity.md). See [novel metadata](NOVEL.md), [translation style](STYLE_GUIDE.md), and [chapter index](chapter-index.md).

## Keep the graph evidence-based

- Stable IDs in registry columns are entity keys. Use those IDs in relationship endpoints and entity/context fields; display names are not keys.
- Link each evidence field to an existing chapter or recap using a relative Markdown link with a filename and `.md` extension, for example `[Chapter 150](chapters/150-azure-heaven-creation-sect-1.md)`. GitNexus extracts cross-file edges from standard `[label](relative/path.md)` links. Obsidian `[[wikilinks]]`, bare filenames, and URLs do not produce those Markdown graph edges.
- Do not replace/remove the source's Obsidian evidence links as part of graph linking. Add the standard relative link alongside them only after checking the target filename exists and the claim is evidenced there. Missing source or recap remains missing; never link it to a substitute.
- GitNexus also creates navigable `Section` nodes from Markdown `#` headings. Give long root registries and memory documents descriptive headings for their meaningful groups; do not add per-paragraph headings or artificial links.
- A GitNexus `IMPORTS` edge means a Markdown document links to another document. It does not mean that one story entity is related to another. Canonical story relations belong only in `relationships.md` with stable IDs, controlled labels, dates/status, and evidence.
- Preserve provenance, uncertainty, timeline, reveal chapter, and spoiler distinctions. Do not upgrade a claim, rumor, inference, or unknown into canon for a prettier graph. Follow [metadata v2 rules](metadata-schema.md) and [QA decisions](qa-log.md).

## Scope and visual interpretation

The registries and memory files are graph-ready context; `chapters/` and `recaps/` remain source prose and chapter memory, respectively, and should not be bulk-rewritten to create backlinks. Metadata evidence may link to an existing chapter/recap. `TEST_REPORT.md`, `README_READER.md`, and `RENCANA_READER.md` describe the reading application; they are not story evidence.
The repository also contains a separate, spoiler-bounded Story Atlas application backed by normalized D1 snapshots. It is distinct from GitNexus and consumes root registries through the metadata importer; treat changes to those files as inputs to that application contract. Its graph retains typed entities, relation status, and source evidence.

To inspect the live application visualization, use `npm run dev` and open its Story Atlas route for a novel with a published snapshot; the route exposes reviewed and spoiler-unlocked ranges. GitNexus supplies the repository's file/heading/link graph instead, not the story-entity graph.

Use GitNexus to inspect document and section nodes and navigate Markdown links. Its Markdown extractor does not parse registry table cells into typed character/location/item/event/relationship nodes: names, stable IDs, and relation rows remain searchable document content, not an automatically rendered entity graph. A visual story-entity graph must be built from the typed registries; interpret only `relationships.md` rows as asserted edges, and retain their status, evidence, and reveal boundaries. Do not treat document links or chapter co-occurrence as canonical relationships.