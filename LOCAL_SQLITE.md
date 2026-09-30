# Local SQLite mode

This project keeps the uploaded Larik React Router UI and replaces the Cloudflare D1 data source with the SQLite database produced by the Python translation pipeline.

## Database

Default path:

```text
storage/story.sqlite3
```

Override it with:

```env
DATABASE_PATH=/absolute/path/to/story.sqlite3
DEFAULT_LANG_ID=id
```

The database must already contain the translator tables:

- `chapters`
- `entities`
- `relationships`
- `terminology`
- `glossary`
- `arcs`
- `style_profiles`
- `translation_runs`

Run the translator's initialization first if needed:

```bash
python main.py init-db
```

The web app creates only its own reader tables in that same SQLite file (`reader_users`, `reader_sessions`, `reader_bookmarks`, `reader_library_state`, and `reader_login_limits`). It does not rewrite the translator tables.

## Run

```bash
cp .env.example .env
npm install
npm run dev
```

The server-side React Router loaders open SQLite through Node's built-in `node:sqlite` module. Use Node 22.22+ as declared in `package.json`.

## Mapping

- Library/chapters -> `chapters`
- Character/place profiles -> `entities`
- Story graph/evolution -> `relationships`
- Terminology -> `terminology`
- Glossary -> `glossary`
- Arc navigator -> `arcs`
- Chapter recap/continuity panel -> `chapters.continuity_summary`
- Editorial/translation run notes -> `translation_runs`

Only `status='completed'` and `stale=0` chapter data is exposed to the reader. Metadata snapshots are joined to those valid chapter rows so stale downstream metadata is not shown.
