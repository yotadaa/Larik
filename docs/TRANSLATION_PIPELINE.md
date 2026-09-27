# Translation Pipeline

## Phase 0 — Intake

Extract:

- target language,
- novel title,
- chapter number,
- chapter title,
- source text boundaries.

Verify the chapter is not accidentally duplicated or truncated.

## Phase 1 — Context Retrieval

Read project memory in this order:

1. `NOVEL.md`
2. `STYLE_GUIDE.md`
3. `glossarium.md`
4. `characters.md`
5. `locations.md`
6. `terminology.md`
7. `continuity.md`
8. `chapter-index.md`
9. previous chapter
10. previous recap

Retrieve older chapters only when the current chapter contains a callback or unresolved terminology.

## Phase 2 — Preflight Term Map

Build an internal mapping for:

- names,
- titles,
- honorifics,
- locations,
- organizations,
- items,
- powers,
- ranks,
- recurring expressions,
- sensitive ambiguities.

Classify terms into:

- confirmed canonical,
- new,
- ambiguous,
- possible source inconsistency.

## Phase 3 — Full-Chapter Comprehension

Read the whole supplied chapter before resolving difficult passages.

Identify:

- POV,
- participants,
- scene changes,
- temporal order,
- emotional arc,
- information reveals,
- intentional ambiguity.

## Phase 4 — Translation

Translate by paragraph or scene while keeping enough surrounding context to avoid sentence-level literalism.

Do not compress.

Do not paraphrase away details.

## Phase 5 — Literary Revision

Check:

- flow,
- unnatural calques,
- repetitive sentence openings,
- dialogue individuality,
- target-language idiom,
- emotional register,
- rhythm.

The revised prose must still preserve source meaning.

## Phase 6 — Consistency Pass

Cross-check against project memory.

Pay special attention to repeated source words that already have canonical equivalents.

## Phase 7 — Completeness Pass

Compare structural units:

- headings,
- paragraphs,
- dialogue turns,
- lists/system messages,
- scene breaks.

Look specifically for accidentally skipped passages.

## Phase 8 — Memory Extraction

Extract only durable information:

- new recurring terms,
- new characters/aliases,
- stable place names,
- terminology system additions,
- continuity constraints,
- unresolved translation questions.

## Phase 9 — Write Outputs

Update:

1. translated chapter,
2. recap,
3. glossary,
4. specialized memory files if needed,
5. chapter index,
6. QA log if needed.

## Phase 10 — Link Repair

Update navigation links for:

- current chapter -> previous,
- current chapter -> index,
- previous chapter -> current chapter.

Do not point to a nonexistent future chapter unless the filename is already established by the project.

## Phase 11 — Final QA

Run `QA_CHECKLIST.md`.

Only after QA should the chapter be considered complete.
