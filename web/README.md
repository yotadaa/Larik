# Larik React preview

The preview is a small client-side React Router app backed by the read-only SQLite preview API exposed by the Python CLI.

## Development

Terminal 1:

```bash
python main.py preview --port 8787 --log-level debug
```

Terminal 2:

```bash
cd web
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

Vite proxies `/api` to the Python preview server.

## Build + single server

```bash
cd web
npm install
npm run build
cd ..
python main.py preview --port 8787
```

After `web/dist` exists, the Python preview server serves both the React Router SPA and `/api/*`, so open `http://127.0.0.1:8787`.

## Theme

Use the theme selector in the top-right. The selected theme is stored in `localStorage`. Presets live in `src/theme.jsx` and are plain CSS-variable maps, so adding or changing a theme does not affect page components.
