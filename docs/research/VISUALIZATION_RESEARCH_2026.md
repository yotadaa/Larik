# Story visualization research — 2026-09-28

## Goal

Choose visualizations that help a reader understand character relationships, terms and continuity
without turning a chapter into a dashboard, exposing future facts, or adding request-time graph/NLP
compute to the Cloudflare Worker. The design constraint for this project is strict: canonical facts,
visibility boundaries and citations live in D1; the web layer queries already-reviewed rows and the
browser performs presentation-only layout/interactions.

## What the research suggests

### 1. Storyline visualization is the best second view for narrative relationships

Storyline visualizations represent entities as lines across a time/chapter axis and use proximity or
connections to show changing relationships. StoryFlow specifically frames the problem as showing
relationships between entities as a story evolves over time, rather than flattening the whole story
into one static network. That property maps directly to our spoiler model: an entity lane and a
relationship marker can begin at its reviewed `visible_from_ordinal`.

**Decision:** implemented now as a native responsive SVG `AtlasStoryline`. It reads only the same
chapter-filtered `AtlasData` already returned by the server. No story analysis or graph optimization
runs in the Worker. For the pilot dataset, deterministic lane order is adequate and is easier to
inspect than a complex automatic optimizer.

Reference: Microsoft Research, *StoryFlow: Tracking the Evolution of Stories* (IEEE TVCG, 2013)
https://www.microsoft.com/en-us/research/publication/storyflow-tracking-evolution-stories/

### 2. Cytoscape.js is the strongest future reader-network candidate at medium scale

Cytoscape.js is a browser graph library with layouts, filtering, gestures and graph algorithms. Its
core is MIT licensed, uses serializable JSON and supports desktop/touch interaction. It would be a
good fit if the manually reviewed graph grows beyond what the current small native layout handles.
It should receive already-filtered D1 data; its algorithms should run in the browser, never against
full-story hidden facts.

**Decision:** not added yet. The current pilot has only a handful of nodes, so adding a dependency
would increase bundle size without improving the reader experience. Re-evaluate around dozens to
low hundreds of visible nodes per chapter boundary.

Reference: https://js.cytoscape.org/

### 3. Sigma.js is compelling only for very large read-only networks

Sigma.js renders browser graphs with WebGL and is designed for thousands of nodes/edges. It uses
Graphology for the graph model. This is attractive for a future whole-corpus exploration mode, but
it is unnecessary for a spoiler-bounded per-novel view while the reviewed graph is small.

**Decision:** reserve for large read-only exploration, not the present reader atlas.

References:
- https://www.sigmajs.org/docs/
- https://www.sigmajs.org/docs/advanced/data/

### 4. React Flow is better suited to an editorial graph editor than the reader view

React Flow provides draggable nodes, edges, zoom/pan, selection and editing primitives. Those are
valuable when an editor needs to create/review relationships and attach evidence; they are more UI
than a quiet reader needs.

**Decision:** do not add it to the reader bundle. Consider it when a real editorial workflow exists
for authoring `story_entities`, `story_relations` and citations.

Reference: https://reactflow.dev/

### 5. Cosmograph is a strong future option if the curated graph becomes genuinely large

Cosmograph v2 provides React/JavaScript libraries with browser-side WebGL/GPU graph layout plus a
timeline and cross-filtering. Its main advantage for this project is architectural: large-network
layout and filtering can stay on the reader device rather than becoming Worker compute. That would
fit a future thousands-of-facts exploration mode, but it is substantial machinery for the current
nine-entity pilot.

**Decision:** research candidate only. Prefer it over adding server-side graph analytics if a future
curated atlas reaches very large scale. Keep D1 as the source of spoiler-filtered truth; never load
future facts into Cosmograph and rely on browser filters for secrecy.

References:
- https://cosmograph.app/library/
- https://cosmograph.app/docs-lib/

### 6. AntV G6 is a flexible middle ground for richer graph interaction

G6 supports graph drawing, layouts, interaction and multiple renderers (Canvas, SVG and WebGL), with
WebGPU/WASM acceleration available for layout-heavy cases. It is a credible alternative when the
reader view needs richer node/edge styling than the native SVG but does not need Cosmograph-scale
analytics.

**Decision:** keep as a second candidate behind Cytoscape for a medium-size reader network. The
editorial graph editor remains a separate problem; React Flow is still a better conceptual fit there.

References:
- https://g6.antv.antgroup.com/en/manual/introduction
- https://g6.antv.antgroup.com/en/manual/further-reading/renderer

### 7. D1 FTS5 is the right foundation for non-interruptive chapter discovery

Cloudflare D1 supports SQLite FTS5. That allows search indexing and matching to stay in the database.
This release adds `story_chapter_fts` plus an insert trigger so chapter revisions replace their
indexed predecessor. The Worker binds the query and returns rows/snippets; it does not scan Markdown.

References:
- https://developers.cloudflare.com/d1/sql-api/sql-statements/
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/

## Implemented visualization set

1. **Focused network** — a small neighborhood around one reviewed entity. Edges are explicit
   `story_relations`; name mentions are no longer converted into apparent relationships.
2. **Storyline** — character lanes across chapter ordinals with reveal-bound relationship markers
   and reviewed events. This directly exposes temporal evolution.
3. **Fact ledger** — searchable entity list with reveal chapter and source review link.
4. **Event timeline** — reviewed events ordered by explicit chapter ordinal.
5. **Inline lookup** — a chapter-safe drawer inside the reading page, using the exact same spoiler
   boundary as the atlas.

## Additional visualizations worth piloting later

### Relationship matrix / heatmap

Rows and columns are characters; cells encode a reviewed relation or interaction category. This is
excellent when a network becomes visually dense because it has no edge crossings. Add a chapter
range slider only if every cell is queried at the selected visibility boundary. Best for 20–100
characters, less intuitive for casual readers than a network.

### Arc diagram by chapter

Place characters on one axis and draw arcs for reviewed relationships. It preserves ordering and is
visually calmer than a force graph. Useful for a single chapter/arc, but repeated arcs become dense.

### Narrative “metro map” / faction lanes

Group characters into reviewed organizations/factions and show transitions over chapter time. This
could make alliance changes easier to understand, but it requires first-class membership facts with
validity intervals. Do not infer faction membership from prose.

### Entity chronology small multiples

One compact strip per selected entity showing first appearance, reviewed events and relationship
changes. This is especially suitable on mobile because readers can inspect one character at a time.

### Evidence provenance graph

A separate editorial/research view linking fact → source chapter → revision/version. It helps audit
canon and continuity but should not share the reader-facing visual hierarchy.

## Explicit non-goals

- No 3D graph: depth adds navigation cost but not narrative information.
- No server-side force layout or NLP extraction.
- No automatic “family/ally/enemy” claims from co-occurrence or name matching.
- No client-side hiding of future facts: excluded facts must never be serialized.
- No graph-editor dependency until an editor actually needs authoring interactions.

## Next research questions

1. At what visible node/edge count does the native network cease to be readable on 390px mobile?
2. Do readers understand storyline reveal markers faster than a relationship graph for changed
   alliances/roles?
3. Should relationship validity support both `visible_from/to` and separate in-world
   `story_time_from/to`? Reader knowledge and story chronology are not the same thing.
4. Would a matrix be more useful than Cytoscape for dense faction-heavy novels?
5. What citation granularity is needed next: chapter, paragraph/block anchor, or quoted excerpt?

## Implemented metadata-v2 visualization pass — 2026-09-29

The canonical metadata is now large and temporal enough to move beyond the original pilot views, but
it is still too sparse in some dimensions to justify a generic graph-editor dependency in the reader
bundle. The implementation therefore stays native React/SVG and maps each visualization to metadata
that already exists in D1.

### Reader-facing views now implemented

1. **Focused network** remains the local relationship browser. It uses explicit stored edges only.
   A chapter-range view may retain a relationship revealed before the range when its
   `valid_from_chapter` / `valid_to_chapter` interval still overlaps the selected window.
2. **Temporal storyline** now ranks characters by explicit relationship/event/scene/arc activity,
   overlays regression-cycle bands, and distinguishes a relationship newly revealed in the selected
   range from already-known relationship context entering at the left boundary.
3. **Relationship matrix** renders explicit character-to-character relationships as a directed
   row/column matrix. It is intentionally capped to the most-connected 16 visible characters so the
   table remains inspectable. It does not infer relations from co-occurrence.
4. **Entity chronology** combines temporal states, event participation, atomic facts, and explicit
   relationships for one entity. States that were revealed before a selected range remain available
   when their validity interval overlaps the range. Realm states also produce a dedicated
   cultivation-progression strip.
5. **Arc & regression-cycle navigator** renders publication-chapter spans for cycles and story arcs,
   plus stored event markers. Publication chapter order and fictional world time remain separate;
   the UI never invents an in-world date from chapter order.
6. **Evidence provenance inspector** groups fact/event/state/scene/relationship evidence by source
   chapter, exposes review status and source links, and surfaces the active snapshot's integrity
   warning count. For range mode, provenance uses reveal/source chapters inside the range rather than
   treating prior context as newly discovered evidence.

### Metadata intentionally not promoted into a dedicated visualization yet

- **Contradiction/history graph** remains deferred because the schema supports `supersedes` and
  `contradicts`, but the current corpus does not yet have enough populated links to make a useful
  reader graph.
- **Item ownership timeline** remains deferred until ownership states/relationships have enough
  temporal coverage.
- **Faction metro map** remains deferred. Current explicit organization membership/hostility rows can
  already be explored in the focused network, but the corpus is not yet dense enough to justify a
  dedicated lane view without inferring membership.
- **React Flow** remains an editorial-tool candidate, not a reader dependency. The review/provenance
  workflow should first demonstrate a real need for direct node/edge authoring.
- **Cytoscape.js** remains a reader-network candidate only if visible node/edge counts grow beyond the
  native focused graph's readable range.

### Temporal semantics used by the UI

`reveal_chapter` and relationship/state validity are deliberately separate:

- `reveal_chapter` controls whether a row may be serialized at all;
- `valid_from_chapter` / `valid_to_chapter` determine whether an already-revealed relationship or
  state is active in the selected chapter range;
- Evidence/provenance views use the reveal/source point, while contextual timeline/network views may
  carry an already-known active row into the selected range.

This keeps range visualizations narratively useful without weakening spoiler enforcement.
