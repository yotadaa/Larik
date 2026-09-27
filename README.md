# Larik

Larik is a React Router v8 novel reader running on Cloudflare Workers with D1. It serves the novel catalog, chapters, recaps, and reference data from the D1 database bound as `DB`.

## Requirements

- Node.js 22.22 or newer
- npm
- Cloudflare account with the D1 database configured in `wrangler.jsonc`
- Wrangler authentication for remote development and deployment

Install dependencies:

```sh
npm install
```

## Environment

For remote D1 development and configuration helpers, create `scripts/sqilte-migration/.env` locally:

```dotenv
CLOUDFLARE_ID=your-cloudflare-account-id
DATABASE_ID=your-d1-database-id
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
```

This file is ignored by Git. Never commit API tokens or local `.dev.vars` files. The development configuration helper writes a generated `.wrangler.production.jsonc`, which is also ignored.

## Run locally

```sh
npm run dev
```

The app runs through the Cloudflare Vite plugin and uses the configured D1 binding. To use local D1 instead, run `npm run db:local:seed` and configure Wrangler to use the local binding.

## Checks and deployment

```sh
npm test
npm run typecheck
npm run build
npm run deploy
```

`npm test` runs schema consistency, repository, route-validation, and static security checks. `npm run deploy` builds and deploys the Worker with Wrangler. Review `wrangler.jsonc` and authenticate the Wrangler CLI before deploying.

## Project layout

- `app/`: React Router pages, components, styles, and D1 repository queries.
- `workers/app.ts`: Worker request handler and Cloudflare binding context.
- `scripts/`: Cloudflare configuration, local D1 fixtures, schema checks, and deployment helpers.
- `tests/`: repository and route behavior checks.
- `scripts/sqilte-migration/DATABASE.md`: D1 schema, queries, and data-source details.

The local novel corpus in `id/`, credentials, generated build output, and local Wrangler state are intentionally excluded from Git.
