# Novel Translation Agent Workflow

## Mission

Translate novel chapters into the requested target language with:

- consistent terminology across chapters,
- natural literary prose,
- preserved characterization and tone,
- stable names, titles, honorifics, ranks, locations, techniques, items, organizations, and recurring phrases,
- accurate continuity with prior chapters,
- a maintained glossary and chapter memory,
- clean, predictable Markdown output.

This repository is a **stateful translation workspace**. Never translate a chapter as an isolated document when previous translation state is available.

---

# 1. Required Inputs

A translation request should contain, explicitly or implicitly:

1. target language, defaulting to Indonesian (`id`) unless another language is requested,
2. novel name,
3. chapter content,
4. chapter number,
5. chapter title if present.

If metadata is embedded in the chapter text, extract it before translation.

Normalize identifiers:

- `language_id`: lowercase language code or project-approved identifier, e.g. `id`, `en`, `es`, `ja`.
- `novel-slug`: lowercase kebab-case form of the novel title.
- `chapter-number`: zero-padded when practical, e.g. `001`, `002`, `043`.

Example workspace:

```text
id/
└── lord-of-the-mysteries/
    ├── NOVEL.md
    ├── STYLE_GUIDE.md
    ├── glossarium.md
    ├── characters.md
    ├── locations.md
    ├── terminology.md
    ├── continuity.md
    ├── chapter-index.md
    ├── qa-log.md
    ├── recaps/
    │   ├── 001-the-beginning.md
    │   └── 002-the-next-step.md
    └── chapters/
        ├── 001-the-beginning.md
        └── 002-the-next-step.md
```

Do not create parallel naming conventions for the same project.

---

# 2. Mandatory Pre-Translation Workflow

Before translating any chapter, perform these steps in order.

## Step 2.1 — Parse chapter metadata

Extract:

- source novel title,
- chapter number,
- source chapter title,
- target language,
- source language if identifiable.

Do not invent a chapter title if none exists. Use `untitled` in the filename when necessary while preserving `Untitled` in metadata.

## Step 2.2 — Resolve the project directory

Use:

```text
language_id/novel-slug/
```

Read `NOVEL.md` first.

Then read, when present:

1. `STYLE_GUIDE.md`
2. `glossarium.md`
3. `characters.md`
4. `locations.md`
5. `terminology.md`
6. `continuity.md`
7. `chapter-index.md`
8. the immediately previous translated chapter
9. the immediately previous recap
10. any earlier chapter specifically referenced by the current chapter

The immediately previous chapter takes precedence for local phrasing consistency, while glossary and terminology files control canonical translations.

## Step 2.3 — Build a translation context

Before drafting, internally identify:

- recurring names,
- aliases,
- titles and honorifics,
- pronouns and gender references,
- organizations/factions,
- places,
- ranks/classes,
- skills/techniques,
- artifacts/items,
- currencies,
- measurements,
- religious or cultural terms,
- idioms,
- catchphrases,
- system/UI terms if the novel is game-like,
- words with multiple possible translations,
- callbacks to prior scenes.

Match them against existing project memory.

If a source term already has a canonical translation, reuse it unless the chapter clearly demonstrates the old entry is wrong.

Never silently change a canonical term.

---

# 3. Translation Priority Order

When rules conflict, use this priority:

1. factual meaning and plot information,
2. character identity and continuity,
3. canonical glossary/terminology,
4. speaker voice and relationship dynamics,
5. scene tone and literary effect,
6. natural target-language prose,
7. sentence-level structural similarity.

Do not preserve awkward source-language syntax when doing so harms readability and does not carry meaningful style.

---

# 4. Translation Rules

## 4.1 Meaning

Preserve:

- events,
- causal relationships,
- implications,
- uncertainty,
- sarcasm,
- irony,
- emotional intensity,
- foreshadowing,
- ambiguity that appears intentional.

Do not add explanations that are absent from the source.

Do not simplify strategic, philosophical, technical, magical, cultivation, historical, or political explanations merely because they are difficult.

## 4.2 Names and terminology

Use canonical forms from project memory.

For a new term:

1. infer its role from context,
2. choose a translation consistent with the novel's existing naming style,
3. keep the source term in glossary metadata,
4. record alternatives only when genuinely relevant.

For proper nouns that should remain untranslated, preserve them consistently.

## 4.3 Dialogue

Preserve each speaker's:

- formality,
- social hierarchy,
- age impression,
- temperament,
- sarcasm,
- politeness,
- roughness,
- verbal habits.

Do not make every character sound like the same narrator.

## 4.4 Narration

Match the project's established narration style.

Maintain distinctions such as:

- formal vs casual narration,
- lyrical vs direct prose,
- comedic vs solemn scenes,
- close POV vs detached narration,
- internal thought vs spoken dialogue.

## 4.5 Honorifics and forms of address

Follow `STYLE_GUIDE.md` and glossary entries.

Do not alternate randomly between translated and untranslated honorifics.

## 4.6 Idioms and wordplay

Prefer functional literary equivalents over literal translations.

If a pun, cultural reference, or wordplay cannot survive directly:

- preserve the intended effect where possible,
- avoid translator notes inside prose unless the project explicitly allows them,
- record the issue in the chapter notes or QA log when important.

## 4.7 Typography

Use project-approved punctuation and quote style.

Do not mix quote conventions within the same project.

Preserve intentional scene breaks using:

```markdown
---
```

Do not overuse bold, italics, headings, or blockquotes in the translated prose unless they correspond to source formatting or project rules.

---

# 5. Drafting Workflow

Translate in semantic units, not isolated sentences.

Recommended internal pass order:

### Pass A — Comprehension
Understand the complete scene before committing difficult terms.

### Pass B — Canonical terminology
Apply glossary, character, location, and terminology mappings.

### Pass C — Literary translation
Produce fluent target-language prose while preserving meaning and voice.

### Pass D — Continuity
Check names, pronouns, abilities, injuries, possessions, relationships, locations, and timeline details.

### Pass E — Style
Remove translationese, unnatural repetition, inconsistent register, and accidental tone shifts.

### Pass F — QA
Run the checklist in `docs/QA_CHECKLIST.md`.

Do not publish the first raw pass as final.

---

# 6. Chapter Output

Store translated chapters in:

```text
language_id/novel-slug/chapters/
```

Filename:

```text
chapter-number-chapter-title-slug.md
```

Example:

```text
003-the-gathering.md
```

Use this structure:

```markdown
---
novel: "Novel Title"
chapter: 3
source_title: "Source Chapter Title"
translated_title: "Translated Chapter Title"
language: "id"
status: "translated"
previous: "002-previous-title.md"
next: "004-next-title.md"
---

# Chapter 3 — Translated Chapter Title

[Previous Chapter](002-previous-title.md) · [Chapter Index](../chapter-index.md) · [Next Chapter](004-next-title.md)

<translated chapter>

---

## Chapter Notes

- New canonical terms: ...
- Continuity notes: ...
- Ambiguities retained: ...
```

### Linking rules

- Link to the previous chapter whenever it exists.
- Link to `../chapter-index.md`.
- Link to the next chapter only when its filename is already known.
- Never fabricate a next chapter title.
- When the next chapter does not yet exist, write:

```markdown
Next Chapter: Pending
```

When the next chapter is later translated, update the previous chapter's navigation link.

---

# 7. Chapter Recap

After translation, create/update:

```text
language_id/novel-slug/recaps/chapter-number-title.md
```

The recap is **memory for future translation**, not a promotional synopsis.

Include:

```markdown
# Chapter 3 Recap — Title

## Plot
- ...

## Character Developments
- ...

## New Information
- ...

## Items / Powers / Techniques
- ...

## Relationship Changes
- ...

## Location / Timeline
- ...

## Unresolved Threads
- ...

## Translation-Relevant Details
- ...
```

Capture details that may matter dozens of chapters later.

Do not omit apparently minor details such as:

- an item changing ownership,
- wounds,
- promises,
- nicknames,
- newly revealed relationships,
- exact ranks,
- debts,
- disguises,
- aliases,
- secret knowledge,
- who witnessed an event.

---

# 8. Glossary Update

After translation, extract only terms that deserve future consistency.

Update:

```text
language_id/novel-slug/glossarium.md
```

Do not add ordinary vocabulary.

Prefer one canonical entry per concept.

Required columns:

```markdown
| Source Term | Canonical Translation | Type | First Seen | Notes |
|---|---|---|---|---|
```

Recommended types:

- character
- alias
- title
- organization
- location
- item
- ability
- technique
- rank
- species
- currency
- cultural term
- catchphrase
- system term
- other

If a canonical translation changes, do not simply overwrite history. Add the reason in Notes and log it in `qa-log.md`.

---

# 9. Specialized Memory Files

Update these only when relevant.

## `characters.md`

Track persistent character information:

- canonical name,
- source name,
- aliases,
- titles,
- pronouns,
- speaking style,
- relationships,
- important translation notes.

Do not turn this into a full encyclopedia.

## `locations.md`

Track:

- canonical place names,
- aliases,
- hierarchy,
- brief continuity notes.

## `terminology.md`

Use for terminology systems that are too complex for a flat glossary, such as:

- cultivation realms,
- magic ranks,
- game classes,
- noble hierarchy,
- military ranks,
- divine systems,
- technology trees.

## `continuity.md`

Track unresolved facts and continuity constraints that can affect future translation.

Examples:

- Character A currently possesses Item B.
- Character C is publicly believed dead.
- Character D does not know Secret E.
- Group F has not yet learned Location G.

Remove or mark entries resolved when the story resolves them.

---

# 10. Chapter Index

Update `chapter-index.md` after every successful chapter.

Format:

```markdown
# Chapter Index

| # | Chapter | Status | Recap |
|---:|---|---|---|
| 1 | [The Beginning](chapters/001-the-beginning.md) | Translated | [Recap](recaps/001-the-beginning.md) |
```

Maintain numerical order.

---

# 11. QA Log

Use `qa-log.md` for project-level translation decisions.

Record:

- terminology changes,
- unresolved source ambiguity,
- retroactive corrections,
- naming collisions,
- title changes,
- inconsistencies found in source text,
- deliberate exceptions to style rules.

Do not flood it with routine entries.

---

# 12. Consistency Conflict Resolution

If two sources conflict, use this order:

1. explicit correction recorded in `qa-log.md`,
2. canonical entry in `glossarium.md` / `terminology.md`,
3. latest confirmed usage in translated chapters,
4. source-language evidence in the current chapter,
5. older chapter wording.

If still unresolved, retain the most defensible existing translation and record the ambiguity for review.

Never create a new translation merely because another synonym sounds better.

---

# 13. Retcon Procedure

When discovering that an earlier translation is wrong:

1. confirm the correction from clear source evidence,
2. update the canonical glossary/terminology entry,
3. record the change in `qa-log.md`,
4. update affected memory files,
5. update earlier translated chapters when practical,
6. preserve consistency going forward.

Do not silently fork terminology.

---

# 14. New Project Initialization

When the novel directory does not exist, create it from the templates.

Required files:

```text
NOVEL.md
STYLE_GUIDE.md
glossarium.md
characters.md
locations.md
terminology.md
continuity.md
chapter-index.md
qa-log.md
chapters/
recaps/
```

Populate `NOVEL.md` from known metadata.

Use sensible defaults in `STYLE_GUIDE.md`, but do not invent story facts.

---

# 15. Final Validation Before Marking a Chapter Complete

A chapter is complete only when all applicable conditions pass:

- chapter number and title are correct,
- complete source content was translated,
- no paragraphs were skipped,
- names match canonical forms,
- terminology matches glossary,
- dialogue register is consistent,
- pronouns and relationships are coherent,
- scene breaks are preserved,
- chapter Markdown is valid,
- previous/index/next navigation is valid,
- recap exists,
- glossary contains newly reusable terms,
- continuity memory is updated,
- chapter index is updated,
- important uncertainty is logged.

If any requirement cannot be completed because information is unavailable, document it rather than guessing.

---

# 16. Prohibited Behaviors

Never:

- translate without checking existing project memory when it exists,
- rename recurring characters or terms casually,
- summarize instead of translating the full supplied chapter,
- omit difficult paragraphs,
- censor ordinary fictional content unless separately required,
- invent missing source text,
- invent chapter titles,
- flatten all dialogue into one voice,
- inject explanations into narrative prose,
- add translator commentary inside scenes without project permission,
- update glossary with every common word,
- claim a continuity fact that the chapter does not establish,
- rewrite plot details to "improve" the story.

---

# 17. Completion Report

After file updates, provide a concise status report containing:

```text
Chapter: <number> — <title>
Translation: complete
Recap: updated
Glossary: <N> new / <N> revised
Character memory: updated / unchanged
Continuity: updated / unchanged
QA issues: none / <short description>
```

Keep this report outside the translated prose.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **novel** (448 symbols, 503 relationships, 3 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/novel/context` | Codebase overview, check index freshness |
| `gitnexus://repo/novel/clusters` | All functional areas |
| `gitnexus://repo/novel/processes` | All execution flows |
| `gitnexus://repo/novel/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
