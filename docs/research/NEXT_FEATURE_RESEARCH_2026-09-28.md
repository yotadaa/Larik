# Next feature research — Metadata Review Queue & Provenance Editor

Date: 2026-09-28

## Recommendation

The next feature should be a **Metadata Review Queue / Provenance Editor**, before adding a heavier reader-facing graph library.

The current corpus already contains structured entities, aliases, relationships, facts, events, states, scenes, arcs, cycles, characteristics, glossary rows, and integrity findings. The highest-leverage next step is therefore to let an editor review the rows that are still unreviewed or structurally inconsistent, inspect their evidence, and promote/correct them safely.

## Why this is the best next step

1. **It expands spoiler-safe coverage instead of only changing presentation.** The current source snapshot is reviewed through chapter 163 while later imported chapters remain unreviewed. A review queue directly increases the amount of trustworthy data the reader can reveal without weakening the existing fail-closed model.
2. **The migration now records actionable integrity findings.** Missing recaps, chapter-index mismatches, duplicate entity IDs, unresolved entity references, missing scene/event links, and unresolved wikilinks are already normalized into `metadata_integrity_issues`. An editor UI can turn those rows into a workflow rather than leaving them only as CLI warnings.
3. **It preserves provenance.** Every correction can show the source Markdown file, evidence chapter, reveal boundary, epistemic status, and current normalized row before an editor approves a change.
4. **It is cheaper than doing runtime inference.** D1 charges/counts rows read and written, and indexed targeted queries reduce rows read. The Free plan currently includes 5 million rows read/day and 100,000 rows written/day; since September 1, 2026 those daily limits are enforced. A queue built from indexed review/status fields fits the existing low-compute architecture better than re-parsing the corpus on requests.
5. **Recovery already exists at the database layer.** D1 Time Travel is always on and supports point-in-time recovery; Free currently retains seven days of history. That makes small, auditable editorial write operations safer, although source Markdown should remain the durable source of truth.

Sources:
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare D1 free-tier enforcement changelog (2026-09-01): https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- Cloudflare D1 Time Travel: https://developers.cloudflare.com/d1/reference/time-travel/

## Proposed editor workflow

```text
Integrity / unreviewed queue
        ↓
Select chapter or issue
        ↓
Show normalized row + source evidence + linked entities
        ↓
Editor decision
  ├─ approve as reviewed
  ├─ correct source metadata
  ├─ merge duplicate entity
  ├─ mark intentional/known issue
  └─ defer
        ↓
Write source Markdown / review patch
        ↓
Run metadata validator
        ↓
Run db:sync
        ↓
New completed snapshot becomes reader-visible
```

Do not make D1 the sole editorial source. The editor should generate or apply deterministic changes back to the Markdown workspace, then let `db:sync` rebuild the database snapshot. This keeps Git/Obsidian/GitNexus and D1 aligned.

## Minimum viable feature

### Queue page

Add an authenticated/editor-only route with filters for:

- severity/code,
- chapter/range,
- source file,
- reviewed/unreviewed,
- entity/fact/event/relationship/state/scene type.

Suggested default groups:

- Chapter/index gaps
- Duplicate canonical IDs
- Unknown entity references
- Broken scene/event references
- Broken evidence/wikilinks
- Unreviewed chapters after the current reviewed boundary

### Provenance inspector

For one selected record show:

- canonical ID and type,
- current normalized values,
- source Markdown file and source row/evidence,
- linked chapter,
- reveal chapter,
- epistemic/review status,
- incoming/outgoing references,
- the proposed correction diff.

### Review actions

Keep actions atomic and explicit. Avoid a free-form “AI fix all” action. Useful operations are:

- approve a row,
- change reveal chapter,
- change epistemic status,
- merge/redirect a duplicate entity ID,
- repair a reference,
- mark an issue as intentionally unresolved,
- regenerate and validate the affected snapshot.

## Data model additions for the editor

Prefer a small additive migration rather than modifying canonical snapshot rows in place:

- `metadata_review_decisions`
  - decision_id
  - novel_id
  - source_hash
  - record_type
  - record_id
  - action
  - before_json
  - after_json
  - note
  - reviewer_user_id
  - created_at
- optional `metadata_issue_resolutions`
  - issue_id
  - resolution_status
  - resolution_note
  - resolved_by
  - resolved_at

The source Markdown remains authoritative. These tables are an audit trail/work queue, not a replacement corpus.

## UI/library direction

The queue and provenance inspector should use ordinary React UI first. A graph editor is useful only when relationship editing becomes a real editorial need.

If that need arrives, React Flow is a viable candidate because it supports custom nodes and custom edges, while reconnectable/editable graph patterns exist in its current documentation. Some advanced editable-edge examples are Pro-only, so the first version should not depend on those paid examples.

Sources:
- React Flow custom nodes: https://reactflow.dev/learn/customization/custom-nodes
- React Flow custom edges: https://reactflow.dev/learn/customization/custom-edges
- React Flow editable edge example: https://reactflow.dev/examples/edges/editable-edge

## Follow-on features after the review queue

Once review coverage and provenance are reliable, the next reader-facing additions can use the same canonical tables without new inference:

1. character state timeline (realm/location/role/title/condition),
2. cultivation progression view,
3. regression-cycle timeline,
4. contradiction/history graph for claimed/inferred/contradicted facts,
5. item ownership timeline,
6. arc navigator and faction/organization explorer.

These features become much more trustworthy after the review queue has raised metadata coverage and resolved the current integrity warnings.
