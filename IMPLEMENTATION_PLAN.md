> Historical baseline retained from the uploaded project. For the account/bookmark/atlas release,
> see [the updated plan](docs/FEATURE_PLAN.md) and [actual evaluation](docs/EVALUATION.md).
> Claims below describe the earlier implementation, not checks executed for this release.

# React Router + Cloudflare Workers Redesign

## Goal

Replace the previous Next.js/vinext application with a single full-stack React Router application that runs directly in the Cloudflare Workers runtime and reads the existing D1 binding (`DB`) in route loaders.

The database schema remains unchanged. `scripts/sqilte-migration/DATABASE.md` and `migrator.py` are the schema references; the included remote verifier must be run against production before deployment.

## Why this architecture

Cloudflare documents React Router as a natively supported full-stack Workers framework using the Cloudflare Vite plugin. Development executes server code in `workerd`, and bindings are available to server-side route loaders. This removes the extra Next.js compatibility layer while keeping SSR, nested routing, loader data, hydration, and client-side navigation.

### Request path

```text
Browser
  ↓
Cloudflare Worker (workers/app.ts)
  ↓
React Router request handler
  ↓
RouterContextProvider
  ↓
Route loader
  ↓
env.DB (D1 binding)
  ↓
SSR HTML + loader payload
  ↓
Hydrated React UI
```

There is no public SQL endpoint and no browser-accessible Cloudflare credential.

## Database constraints preserved

The app queries only these existing tables:

- `novel`
- `novel-content`
- `characters`
- `continuities`
- `glossariums`
- `locations`
- `terminologies`
- `qa-log`

Important schema behavior retained:

- Hyphenated table/column identifiers remain double-quoted in SQL.
- Query values use D1 `.bind(...)` parameters.
- `chapter-id` is treated as arbitrary text, not a number.
- The migrator is append-only; where a stable logical key exists the reader selects the newest row by generated `id`.
- Empty glossary data is valid.
- D1 errors are surfaced; the application never falls back silently to local Markdown.

## Routes

| Route | Purpose | D1 data |
|---|---|---|
| `/` | Landing/discovery page | catalog counts, languages, novels |
| `/library` | Searchable/filterable catalog | `novel`, chapter counts |
| `/novels/:novelId` | Novel landing + chapter index + story atlas navigation | `novel`, `novel-content`, reference counts |
| `/novels/:novelId/chapters/:chapterId` | Long-form chapter reader, recap, previous/next | `novel-content` |
| `/novels/:novelId/reference/characters` | Character reference | `characters` |
| `/novels/:novelId/reference/locations` | Location reference | `locations` |
| `/novels/:novelId/reference/terminology` | Terminology reference | `terminologies` |
| `/novels/:novelId/reference/glossary` | Glossary lookup | `glossariums` |
| `/novels/:novelId/reference/continuity` | Spoiler-gated continuity context | `continuities` |
| `/novels/:novelId/reference/qa` | Spoiler-gated translation QA context | `qa-log` |

## UX direction

The redesign intentionally avoids generic dashboard aesthetics, gradients, glass cards, fake cover art, generated illustrations, and oversized decorative iconography.

The visual language is editorial:

- warm paper background,
- typographic book-cover placeholders generated only from the real title/language metadata,
- serif display typography,
- quiet hairline rules,
- restrained brick-red accent,
- strong whitespace,
- no decorative imagery required.

### Reading UX

The reader is separated from reference material. The chapter page uses:

- centered long-form measure,
- user-adjustable theme, font family, text size, line height, and line measure,
- persisted browser preferences,
- scroll progress indicator,
- recap collapsed by default,
- explicit previous/next chapter navigation,
- exact text chapter IDs preserved in URLs.

The reading measure defaults to `68ch`, consistent with common guidance that roughly 45–75 characters is comfortable for single-column prose. Controls are intentionally larger than the WCAG 2.2 minimum target size, and layout does not depend on fixed-height containers so custom text spacing can reflow safely.

## Cloudflare runtime design

### `workers/app.ts`

The Worker owns the request entrypoint. Each request receives a fresh `RouterContextProvider` containing:

```text
{ env, ctx }
```

`env.DB` is therefore available only inside server execution.

### `app/lib/cloudflare-context.ts`

Defines the typed React Router context key used by loaders.

### `app/lib/repository.ts`

Contains all database SQL. UI routes never construct SQL.

## Security

- No write routes.
- No arbitrary SQL route.
- No API token/account/database ID in browser modules.
- Route segments reject slashes, backslashes, control characters, and excessive length.
- Search text is length-limited and always parameter-bound.
- Remote schema verification uses the Cloudflare REST API only from a Node setup script.
- Production Worker data access uses the D1 binding rather than REST credentials.

## Verification plan

1. Compare `DATABASE.md` and `migrator.py` declarations.
2. Exercise repository queries with an isolated SQLite/D1-compatible test double.
3. Test punctuation-heavy chapter IDs.
4. Test duplicate/newest-row behavior.
5. Test empty glossary state.
6. Test SQL-injection-shaped search input.
7. Scan browser/Worker source for Cloudflare credential names.
8. After dependencies are installed, run React Router type generation/build and Wrangler dry-run.
9. With credentials available, run remote D1 schema verification before production deployment.
10. Optionally run local Worker code against production D1 via a remote D1 binding.

## Visual system refinement

The UI uses a custom SVG brand mark rather than a stock icon. The mark combines an architectural arch (the “room”) with an open book (the reading experience), and is shipped at `public/brand-mark.svg` for use as both the visible brand mark and SVG favicon.

All semantic interface icons use the official `@heroicons/react` package. Buttons are designed as complete controls rather than plain text links: they pair concise labels with appropriate outline icons, provide distinct primary/secondary hierarchy, retain visible keyboard focus, and include restrained hover/pressed motion. Decorative Unicode arrows are prohibited in TSX by the static UI/security check so future changes keep the same icon policy.
