# Implementation evaluation — 2026-09-28

No production Cloudflare resource was changed during this implementation.

## Executed successfully

- SQLite/D1-compatible migration validation: `0001` + `0002` applies; legacy bookmarks survive;
  existing sessions become `prototype`; 9 reviewed entities, 4 reviewed relations and 3 reviewed
  events are seeded; FTS5 indexes content and its insert trigger replaces older chapter revisions.
- `0002` was also applied to a copy of the uploaded project's 151-chapter local D1 schema: all 151 latest
  chapters were indexed, both existing bookmarks remained, and the original database file was not modified.
- Reader/atlas/D1 migration regression suite: **35/35 passed** with `npm run test:reader-features`
  (13 auth/reader/atlas/repository tests + 22 JavaScript remote-migration tests).
- Auth tests cover password policy, salted PBKDF2 storage, wrong/blind login rejection, prototype
  session denial, safe legacy upgrade, session revocation and account-isolated bookmarks.
- Reader tests cover D1 progress/shelf persistence plus progress-sync and resume-open counters.
- Knowledge tests prove chapter 1 does not serialize chapter 2/3 entities, invalid/unreviewed
  boundaries fail closed, edge endpoints are visible, and inline lookup shares the same boundary.
- FTS tests prove a chapter revision removes the previous text from search and indexes the new row.
- Chapter navigation test proves previous/next resolution is performed by a D1 window query rather than loading the chapter list into Worker memory.
- The JavaScript REST migrator has **22/22** focused tests; its real `0001` + `0002` batch was executed against SQLite and recorded both entries in `d1_migrations`.
- Source scan confirms there is no native `<select>` element under `app/`.

## Build gate limitation

The supplied project requires Node >=22.22.0. This execution environment provides Node 22.16.0.
An npm dependency installation was attempted, and a direct registry ping failed with DNS `EAI_AGAIN`; therefore a production
React Router/Cloudflare build is not claimed here. The changed TS/TSX sources are additionally
syntax-checked separately before packaging.

Run the release gate on Node 22.22+ with the project dependencies available, then apply the new D1
migration to staging before production.

## Performance boundary

The implementation avoids request-time corpus parsing and relationship inference. D1 stores the
knowledge facts, reveal boundaries, reader state and FTS index. Server work is limited to prepared
D1 queries plus the required authentication/password operations. Network/storyline layout and
lookup filtering are browser-side presentation work over already spoiler-filtered rows.


## Repository graph-analysis limitation

The repository's GitNexus instructions require impact/change analysis. Its `.gitnexus/run.cjs` is
present, but this environment has no installed `gitnexus`, `pnpm`, or `bunx`; the runner therefore
falls back to `npx`, which cannot reach the npm registry here. A clean GitNexus impact/change result
is therefore not claimed. Direct dependency inspection, source scans, focused service tests and
core-library typechecking were used instead. Re-run GitNexus impact/change analysis in the
network-enabled release checkout.
