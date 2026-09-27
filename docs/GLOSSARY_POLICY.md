# Glossary Policy

## Purpose

The glossary exists to prevent translation drift.

It is not a dictionary and should not contain every unusual word.

## Add an entry when a term is likely to recur or when inconsistency would matter.

Good candidates:

- names and aliases,
- titles,
- organizations,
- places,
- named items,
- abilities,
- techniques,
- ranks,
- species,
- currencies,
- culturally specific recurring concepts,
- catchphrases,
- system labels.

## Do not add

- ordinary verbs,
- generic adjectives,
- one-off descriptive nouns,
- words whose translation is obvious and context-independent.

## Canonical entry format

```markdown
| Source Term | Canonical Translation | Type | First Seen | Notes |
|---|---|---|---|---|
| example | Example | ability | Ch. 12 | Capitalize as a named technique. |
```

## Ambiguous terms

If a term has not been fully explained:

- choose the least overcommitted translation,
- mention uncertainty in Notes,
- do not encode speculative lore as fact.

## Changing a canonical translation

A canonical translation may be changed when:

- later source text reveals the original interpretation was wrong,
- the existing translation creates a severe contradiction,
- the project owner explicitly requests the change.

When changing it:

1. update the glossary,
2. record old -> new in `qa-log.md`,
3. update affected memory files,
4. correct old chapters when feasible.

## Capitalization

Use project style rules rather than source capitalization blindly.

Named concepts should be capitalized only when the target language/project style warrants it.
