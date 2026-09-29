# Metadata reader experience research — 2026-09-29

## Goal

Use every Markdown source according to what it actually represents without turning the reading page into a dashboard. The reader should encounter story metadata in layers:

1. **During reading:** prose first; only lightweight, chapter-safe lookup is always available.
2. **After a chapter:** optional collapsed chapter context for reviewed scenes/events/newly revealed knowledge.
3. **When exploring:** Story Atlas for profiles, relationships, chronology, arcs/cycles, and provenance.
4. **When auditing/editing:** QA/schema/project documents stay secondary and should not compete with reader-facing story surfaces.

The server remains responsible for spoiler filtering. The browser receives only rows allowed by the selected reveal boundary.

## Research that informs the design

### Storyline for changing relationships

StoryFlow describes storyline visualizations as a way to illustrate dynamic relationships between entities over time. That matches regression/cycle/chapter data better than a single static graph.

Source: https://www.microsoft.com/en-us/research/publication/storyflow-tracking-evolution-stories/

**Application:** keep Storyline as a temporal Atlas view and combine it with cycles/arcs rather than making the main chapter page a graph.

### Matrix plus node-link instead of choosing only one

Ghoniem, Fekete, and Castagliola found that matrix representations outperform node-link diagrams on most tested tasks once graphs become larger than roughly twenty vertices, while path finding remains favorable to node-link views. MatrixExplorer likewise uses synchronized node-link and matrix representations.

Sources:
- https://doi.org/10.1057/palgrave.ivs.9500092
- https://www.microsoft.com/en-us/research/publication/matrixexplorer-dual-representation-system-explore-social-networks/

**Application:** retain both focused Network and Relationship Matrix. Network answers “who connects to this entity?”; Matrix answers dense comparison questions without edge crossings.

### Reflow and mobile reading

WCAG 2.2 Reflow requires normal content to work without two-dimensional scrolling at a width equivalent to 320 CSS pixels, except content whose meaning genuinely requires two-dimensional layout such as diagrams and data tables.

Sources:
- https://www.w3.org/TR/WCAG22/#reflow
- https://www.w3.org/WAI/WCAG22/Techniques/general/G225

**Application:** chapter prose, profiles, evidence cards, and context panels must reflow normally. Only the relationship matrix/diagram can use deliberate horizontal/2D navigation, and its individual detail panel remains readable without horizontal text scrolling.

### Graph editing is a different product surface

React Flow supports custom nodes and custom edges; its current editable-edge example is a Pro example. Those interaction primitives are valuable for an editorial review tool, not required for a quiet reader view.

Sources:
- https://reactflow.dev/examples
- https://reactflow.dev/examples/edges/editable-edge

**Application:** do not add React Flow to the reader bundle. Revisit it only for a metadata review/authoring queue.

## Metadata-to-UI map

| Markdown | Semantic role | Reader-facing surface | Display rule |
|---|---|---|---|
| `NOVEL.md` | Novel identity/project metadata | Novel landing page | Display stable title/language/project information; do not expose recovery/editor notes as story facts. |
| `chapter-index.md` | Chapter navigation/status | Table of contents | Navigation/search source; actual available chapter rows remain authoritative for reading. |
| `entities.md` | Stable canonical entity registry | Infrastructure + Network/Lookup labels | Keep descriptions minimal and spoiler-safe. Do **not** merge cumulative biography into early entity rows. |
| `aliases.md` | Time/reveal-aware names and identities | Inline Lookup + Network/Profile aliases | Serialize only after alias `reveal_chapter`; hidden identities are never sent early. |
| `characteristics.md` | Cumulative entity profiles | **Profiles** Atlas view | Detailed rows are snapshots and appear only at/after their full `characteristic_as_of_chN` boundary. Registry-only rows may appear at first-seen. |
| `relationships.md` | Explicit temporal edges | Network + Matrix + Character chronology | Show explicit edges only. Use `valid_from/to` for active context and `reveal_chapter` for reader knowledge. |
| `facts.md` | Atomic propositions + epistemic state | Character chronology + Evidence + chapter context | Show newly revealed facts after a chapter; retain claimed/inferred/contradicted status. |
| `states.md` | Persistent temporal entity state | Character chronology / cultivation progression | Timeline view by property (realm/location/role/title/etc.); an earlier state stays visible while valid. |
| `events.md` | Atomic chapter events | Storyline + chapter context + Evidence | Ordered by chapter/scene/timeline metadata; do not collapse a whole chapter into one inferred event. |
| `scenes.md` | Local scene structure | Collapsed chapter context + Evidence | Good for “where/who/when” after reading; do not insert scene cards inside prose. |
| `arcs.md` | High-level narrative ranges | Arcs & cycles navigator | Range bands and navigation; summaries are high-level memory, not substitutes for source review. |
| `cycles.md` | Regression/time structure | Arcs & cycles + Storyline background | Visual cycle bands; do not assume chapter order equals fictional chronology. |
| `glossarium.md` | Canonical term mapping | Inline Lookup + searchable Glossary | Prefer compact term → canonical translation; long notes remain secondary. |
| `terminology.md` | Translation/project terminology memory | Searchable Terminology reference | Useful on demand; not a visual graph. |
| `characters.md` | Legacy/human translation-memory character notes | Characters reference | Keep as a secondary text reference. Canonical Atlas identity comes from `entities.md` + structured metadata. |
| `locations.md` | Legacy/human location memory | Places reference + Atlas entities where canonical IDs exist | Search/card display; do not invent map coordinates. |
| `continuity.md` | Carry-forward constraints/mysteries | Spoiler-gated Continuity reference | Advanced reader/editor layer; not shown automatically during a chapter. |
| `qa-log.md` | Translation/data QA | **Editorial QA** reference | Clearly label editorial; never present QA notes as canon. |
| `metadata-schema.md` | Data contract | Archive/editor documentation | Not a reader story surface. Use for validation/tooling. |
| `STYLE_GUIDE.md` | Translation style policy | Archive/editor documentation | Not a story visualization. |
| `GITNEXUS.md` | Knowledge graph/editor instructions | Archive/editor documentation | Not reader-facing canon. |
| `README_READER.md` | Legacy/local reader instructions | Project documentation | Deployment/help only. |
| `RENCANA_READER.md` | Reader design plan/research | Project documentation | Product rationale; not story content. |
| `TEST_REPORT.md` | Verification report | Project/editor documentation | Keep outside story hierarchy. |

## Implemented in this patch

### 1. `characteristics.md` becomes a real profile layer

The migrator now stores an explicit `profile_through_chapter`.

- detailed profile: boundary = `characteristic_as_of_chN` (`151` in the current source),
- registry-only row: boundary = `first_seen`.

The canonical entity table no longer copies cumulative characteristic prose into `metadata_entities.description`. This prevents a Chapter 151 biography from appearing as soon as a Chapter 1 entity becomes visible.

### 2. Profiles Atlas view

The new Profiles view supports:

- text search,
- entity-type filter,
- physical form,
- temperament/properties,
- ability/role,
- relationship/status prose,
- cumulative snapshot,
- evidence chapter links,
- counts of structured relationships/states/facts in the selected Atlas window.

A profile URL can be opened directly with `?view=profiles`.

### 3. Chapter context after—not during—reading

Reviewed chapter metadata is shown in a collapsed **Story context for this chapter** block after the article body. It can contain:

- scenes,
- events,
- newly revealed states,
- newly revealed explicit relationships,
- newly revealed facts.

It stays collapsed by default and links to the Evidence view for deeper inspection.

### 4. Inline Lookup uses safe profile summaries only when available

Before a cumulative profile boundary, Inline Lookup uses only the minimal canonical entity description. Once a detailed profile itself is safe, lookup may use its safe role/property summary. Future profile prose is never serialized merely because the entity was introduced earlier.

### 5. Direct Story Reference navigation

`Entity profiles` is now a first-class Story Reference destination. `QA notes` is relabeled `Editorial QA` so readers do not mistake translation QA for canonical story knowledge.

## Recommended next implementation sequence

1. **Metadata review queue (editor-only):** unresolved IDs, broken scene/event references, duplicate registry history, evidence links, review status.
2. **Unified term lookup:** merge canonical glossary + terminology + safe entity aliases into one search endpoint while retaining source/type provenance.
3. **Location chronology:** use `states.property=location` plus scene locations; do not create a geographic map until coordinates/region hierarchy exist in metadata.
4. **Contradiction/history view:** only once `supersedes`/`contradicts` links become dense enough to be useful.
5. **Item ownership timeline:** driven by `states.property=ownership`; no prose inference.
6. **Faction/organization lanes:** only after temporal membership relationships are sufficiently complete.
7. **Editorial graph authoring:** consider React Flow only when editors actually need to create/reconnect relationships visually.

## Non-goals

- No 3D knowledge graph.
- No server-side force layout/NLP inference.
- No automatic family/friend/enemy relationship from co-occurrence.
- No geographic map without source-backed coordinates or hierarchy.
- No future metadata sent to the client and hidden only with CSS.
- No attempt to display every project Markdown as if it were canon.
