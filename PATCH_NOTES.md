# Applying this changed-files-only patch

This archive intentionally contains **only files added or modified** relative to the uploaded
`app.zip`. Extract it over that project root. It does not contain `.env`, credentials, local D1
state, `node_modules`, generated build output, or unchanged novel Markdown.

## Required database step

Back up the remote D1 database, then use the included JavaScript REST migrator (no Wrangler):

```sh
npm run db:migrate:status
npm run db:migrate:remote
npm run db:verify:readers
```

It reads `DATABASE_NAME`, `DATABASE_ID`, `CLOUDFLARE_ID`, and `CLOUDFLARE_API_TOKEN` from the
project-root `.env`. Migration `0002_verified_identity_progress_knowledge.sql` adds password account
fields, reader state/measurement, a reviewed spoiler-aware knowledge model, and D1 FTS5 search.

## Rebuild

Delete/replace any old generated `build/` output and rebuild the application in a network-enabled
Node.js 22.22+ environment:

```sh
npm install
npm run build
```

The authoring environment could not reach npm, so a production framework build is not represented
by old bundled output. See `docs/EVALUATION.md` for checks that were actually executed. The focused offline regression suite can be repeated with `npm run test:reader-features`.
