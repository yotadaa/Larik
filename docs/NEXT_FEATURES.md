# Next feature plan — status after the 2026-09-28 implementation

This file distinguishes what is now implemented from what should happen next. Visualization research
is in `research/VISUALIZATION_RESEARCH_2026.md`.

## Completed in this cycle

- [x] Password registration and password login. Blind email login is removed.
- [x] Existing prototype sessions are rejected for ordinary authenticated access.
- [x] A still-valid prototype session can upgrade its own stable user ID, preserving bookmarks;
      email knowledge by itself cannot claim legacy data.
- [x] Resume-reading state stored per user/novel in D1 and restored only from an explicit Resume action.
- [x] Simple shelf status: Want to read, Reading, Paused, Finished.
- [x] Bounded progress writes at 0/25/50/75/90/100 rather than every scroll event, plus D1 counters for progress syncs and resume opens.
- [x] Versioned, manually reviewed spoiler-safe fact pilot for one novel, chapters 1–3.
- [x] D1-enforced chapter visibility for entities, relationships and events.
- [x] Inline chapter-safe lookup and source links.
- [x] D1 FTS5 chapter search with a trigger that follows appended chapter revisions.
- [x] Reader visualizations: focused network, storyline, fact ledger and event timeline.
- [x] All dropdowns in the application use the custom listbox component; no raw `<select>` remains.

## Important identity boundary still open

The account is now **password protected**, but mailbox ownership is **not yet verified** because no
email delivery flow exists. `email_verified_at` therefore remains `NULL`. Do not describe this as
verified email identity. Sensitive future features (account export containing private annotations,
account recovery, paid entitlements, admin access) should wait for a verification/recovery design.

## Next implementation sequence

### 1. Network-enabled release/staging gate

Run the real React Router/Workers build on Node 22.22+, stage `0002_verified_identity_progress_knowledge.sql`
against a copy of production D1, run browser tests, and inspect D1 rows read/written. The current
runner is Node 22.16, below the project engine requirement.

### 2. Mailbox verification and password recovery

Add a transactional mail provider, expiring one-use challenge hashes, resend throttling, recovery,
and session rotation. Preserve the current password session boundary. A verified session must never
be obtained merely by entering an address.

### 3. Expand curated knowledge incrementally

The current uploaded corpus has 182 actual chapter files and metadata marked reviewed through chapter 163. Expand curated coverage beyond 163 through the metadata-v2 source files and review workflow; keep every reveal boundary tested and continue to fail closed for unknown/unreviewed knowledge.

### 4. Editorial evidence workflow

Add tooling for reviewed relationship authoring, source citation and version promotion. React Flow
is a candidate only for this editor, not automatically for the reader-facing graph. Consider
paragraph/block source anchors before enabling private annotations.

### 5. Offline chapters and personal annotations

Only after ownership/recovery and retention decisions are explicit. Use stable anchors for notes,
not pixel offsets. Define logout/cache behavior and conflict handling before shipping offline sync.

## Measurements worth keeping small and privacy-preserving

- progress-write count per reading session (aggregate, not every scroll position),
- successful return to the stored chapter,
- FTS query latency and D1 rows read,
- atlas payload size by chapter boundary,
- visible graph node/edge counts at mobile breakpoints.

Avoid detailed reading surveillance or storing every scroll event.

## 2026-09-28 metadata-v2 update

The metadata-v2 ingestion requested after the original checkpoint is now implemented. The immediate
next product feature should be a **Metadata Review Queue / Provenance Editor**, not another passive
visualization. The current synchronizer already records integrity warnings and preserves source
evidence, so a review workflow can expand trustworthy spoiler-safe coverage beyond the current reviewed
boundary while keeping Markdown as the source of truth.

See `docs/research/NEXT_FEATURE_RESEARCH_2026-09-28.md` for the current D1 constraints, proposed review
data model, editor workflow, and follow-on reader visualizations.
