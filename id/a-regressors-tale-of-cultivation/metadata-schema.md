# Metadata v2 Contract

Canonical schema and authoring rules for story metadata. Follow this contract when adding or changing rows in the v2 registries.

## Stable identity

Use lowercase ASCII IDs with stable type prefixes: `char:`, `loc:`, `org:`, `item:`, `tech:`, `realm:`, `concept:`, `species:`, `event:`, `fact:`, `rel:`, `state:`, `scene:`, `arc:`, `cycle:`, and `alias:`. Never use a display name as the database key. Put alternate names, titles, disguises, and romanizations in `aliases.md`; do not duplicate the entity.

## Spoiler and time semantics

Keep `reveal_chapter` (when readers may know it), `valid_from_chapter` (when it became true in story time), and `valid_to_chapter` (when it stopped being true) distinct. Empty end chapters mean no end is established. Do not assume publication chapter order equals fictional chronology; use `unknown` where source evidence is missing.

## Epistemic status and source type

Allowed statuses: `confirmed`, `claimed`, `rumor`, `inferred`, `contradicted`, `unknown`. Allowed source types: `narration`, `dialogue`, `internal_monologue`, `memory`, `document`, `legend`, `observation`, `metadata`. Preserve claims and theories without upgrading them to canon.

## Relationships, facts, events, states

Use the controlled relation vocabulary: `family`, `parent_of`, `child_of`, `sibling_of`, `friend`, `ally`, `enemy`, `hostile_to`, `mentor_of`, `student_of`, `member_of`, `leader_of`, `serves`, `owns`, `created`, `uses`, `located_at`, `travels_with`, `protects`, `trusts`, `distrusts`, `romantic_interest`, `engaged_to`, `married_to`, `knows_identity_of`. New relation labels require justification here.

State properties should prefer `realm`, `location`, `organization`, `role`, `alive_status`, `condition`, `ownership`, `title`, `ability`, `identity_status`, `equipment`, and `goal`. Events should use atomic rows, not a chapter synopsis. Every fact, event, state, scene, relationship, and arc needs evidence. Preserve history; close superseded states with valid-to values instead of overwriting them.

## Safe editing and data-loss prevention

- Before editing any existing metadata file, read its full current contents and preserve all existing rows and prose.
- `write` replaces the entire file. Never use it to append to an existing ledger or memory file. For one new row, use `edit` to insert at the appropriate location; for bulk reconstruction, build and validate the complete replacement from verified source data before writing.
- After each edit, recount rows and chapter coverage; verify the prior rows remain. For bulk updates, compare stable IDs before/after and check uniqueness.
- Do not mark a chapter's metadata reviewed until translation/recap evidence and all cross-references have been checked.
 - Keep a recoverable history (version control or a dated backup) before destructive whole-file restructuring.
 - For filesystem reads, pass one repository path per tool call unless that tool explicitly documents a multi-path syntax. Never use shell-like `;` path separation in a single path parameter; inspect the returned canonical path before writing.
 - Before creating any new `ledgers/` directory, check whether the canonical tables already exist at the project root. Do not create duplicate/nested ledger paths by guessing a directory layout.

## Chapter-scoped processing checklist

For each translated chapter: read project memory and source; identify entities, aliases, atomic scenes/events/facts/state changes and relationships; reuse canonical IDs; set cycle/timeline only when supported; link evidence; update the recap IDs; append, never replace, registry history; validate references and update chapter index only after review. If a point is uncertain, record `unknown`/appropriate epistemic status and explain in `qa-log.md`.

## Current recovery caveat

The former event, fact, and state ledgers were accidentally replaced by Chapter 158-only files. Exact row payloads for Chapters 154–158 have been recovered from this session's operation history and restored. This does not establish complete recovery of earlier chapters' granular rows; the restored range must not be mistaken for an exhaustive 1–163 ledger. Indonesian chapter files 153–157 are currently 22-byte stubs, while English source files and Indonesian recaps exist; use the source/recap and mark any unreconciled metadata as requiring review.