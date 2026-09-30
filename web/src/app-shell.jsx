import React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useTheme } from "./theme";

function ThemePicker({ compact = false }) {
  const { themeId, setThemeId, themes } = useTheme();
  return (
    <label className={`theme-picker${compact ? " theme-picker--compact" : ""}`}>
      {!compact && <span>Theme</span>}
      <select value={themeId} onChange={(event) => setThemeId(event.target.value)} aria-label="Interface theme">
        {Object.entries(themes).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
      </select>
    </label>
  );
}

export function AppShell() {
  const location = useLocation();
  const novelMatch = location.pathname.match(/^\/novel\/([^/]+)/);
  const novelId = novelMatch ? decodeURIComponent(novelMatch[1]) : null;
  const lang = new URLSearchParams(location.search).get("lang") || "id";
  const isReader = /^\/novel\/[^/]+\/chapter\//.test(location.pathname);

  if (isReader) {
    return (
      <div className="app-shell app-shell--reader">
        <header className="reader-toolbar-global">
          <div className="reader-toolbar-global__inner">
            <Link className="reader-brand" to="/" aria-label="Larik library">
              <span className="brand-mark brand-mark--small">L</span>
              <strong>Larik</strong>
            </Link>
            <div className="reader-crumb">
              <Link to={`/novel/${encodeURIComponent(novelId)}?lang=${lang}`}>Chapters</Link>
              <span aria-hidden="true">/</span>
              <span className="reader-crumb__current">Reading view</span>
            </div>
            <div className="reader-toolbar-actions">
              <Link className="toolbar-link" to={`/novel/${encodeURIComponent(novelId)}/atlas?lang=${lang}`}>Story Atlas</Link>
              <ThemePicker compact />
            </div>
          </div>
        </header>
        <main className="reader-main"><Outlet /></main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/" className="brand" aria-label="Larik home">
            <span className="brand-mark">L</span>
            <span className="brand-copy"><strong>Larik</strong><small>translation workspace</small></span>
          </Link>
          <nav className="site-nav" aria-label="Primary navigation">
            <NavLink to="/" end>Library</NavLink>
            {novelId && <NavLink to={`/novel/${encodeURIComponent(novelId)}?lang=${lang}`}>Chapters</NavLink>}
            {novelId && <NavLink to={`/novel/${encodeURIComponent(novelId)}/atlas?lang=${lang}`}>Story Atlas</NavLink>}
          </nav>
          <ThemePicker />
        </div>
      </header>
      <main className="page-shell page-content"><Outlet /></main>
      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="footer-brand">
            <span className="brand-mark brand-mark--small">L</span>
            <div><p className="eyebrow">Larik preview</p><p>Read translations, inspect continuity, and verify metadata without leaving the local workspace.</p></div>
          </div>
          <div className="footer-note"><span>React Router</span><span>SQLite</span><span>Sequential pipeline</span></div>
        </div>
      </footer>
    </div>
  );
}
