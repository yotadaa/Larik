# Feature plan — verified account boundary, spoiler-safe knowledge, quiet discovery

Status: implemented in the current changed-file patch, with the production build/staging gate still
requiring a network-enabled Node 22.22+ checkout.

## Goals

1. Remove blind email login: users register first and then authenticate with email + password.
2. Preserve legacy reader IDs/bookmarks only when the browser still proves possession of its old
   prototype session.
3. Replace cumulative/inferred Atlas data with a reviewed, versioned, chapter-safe knowledge model.
4. Improve discovery without pulling readers away from the chapter.
5. Keep expensive/derivative work out of Worker requests: persistent facts/indexes in D1, visual
   presentation/layout in the browser.
6. Remove native browser dropdowns from application UI.

## Implementation sequence

### Identity

- Added password columns and password session method.
- Added `/register` and password-required `/login`.
- Disabled prototype sessions for normal authenticated routes.
- Allowed one-time legacy upgrade only with the still-valid prototype cookie for that exact user.
- Left mailbox verification explicitly pending rather than pretending an email has been verified.

### Reader retention

- Added D1 shelf status and last chapter/progress state.
- Progress writes are checkpointed to six percentages per chapter.
- Explicit Resume links restore the saved checkpoint in the browser.
- D1 counters record progress syncs and resume opens so write behavior and resume usage are measurable.

### Spoiler model foundation (historical pilot)

- Added versioned chapter sequence, entities, explicit relationships and events.
- Every fact has a reviewed flag and reveal ordinal.
- Safe Atlas queries filter by reveal ordinal in D1 before serialization.
- Uncovered chapters fail closed.
- The initial seed was a manually reviewed chapters 1-3 pilot. Metadata-v2 synchronization now supersedes this as the preferred canonical source while retaining the pilot tables as a compatibility fallback.

### Quiet discovery

- Added chapter-side inline lookup using the same spoiler boundary as the Atlas.
- Added D1 FTS5 chapter search and stored snippets; no Worker corpus scan.
- Added temporal Storyline visualization alongside the focused network and structured Facts, Events, States, Scenes, and Arcs/Cycles views.

### UI controls

- Added a reusable custom listbox and migrated library, bookmarks, reader settings, shelf status and
  Atlas controls away from native `select` elements.

## Server-compute boundary

D1 stores source data, reveal boundaries, chapter search index, progress and shelf state. Worker code
performs bounded prepared queries, authentication checks and password verification only. It does not
run NLP, infer relationships, scan the corpus, calculate graph topology or build visualizations.
Graph/storyline layout and filtering are client-side.

Password verification is necessarily authentication compute; it uses WebCrypto rather than a custom
or reversible password scheme.

## Acceptance checks

- Email-only login fails; registration is required.
- Password hashes are salted and plaintext is never stored.
- Prototype sessions cannot access authenticated pages.
- Legacy bookmarks survive only a cookie-proven one-time upgrade.
- No application JSX contains a native `select` element.
- Atlas chapter 1 never receives chapter 2/3 facts.
- Unknown Atlas chapter boundaries do not fall back to full-story data.
- Inline lookup inherits the exact same spoiler boundary.
- Search uses D1 FTS and follows latest chapter revisions.
- Progress/shelf state is isolated by authenticated user.
- Resume opens and bounded sync counts are persisted for measurement.
