import React, { useMemo, useState } from "react";
import { Link, useLoaderData } from "react-router";

function titleCase(value = "") {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function DashboardPage() {
  const data = useLoaderData();
  const novels = data.novels || [];
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => novels.filter((novel) => !query || `${novel.novel_id} ${novel.lang_id}`.toLowerCase().includes(query.toLowerCase())), [novels, query]);
  const chaptersReady = novels.reduce((total, item) => total + Number(item.completed || 0), 0);
  const languages = new Set(novels.map((item) => item.lang_id).filter(Boolean)).size;
  const series = new Set(novels.map((item) => item.novel_id).filter(Boolean)).size;

  return (
    <div className="home-page">
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="eyebrow">Sequential translation workspace</p>
          <h1>Stories deserve<br />room to stay consistent.</h1>
          <p className="lede">Preview translated chapters, follow entity relationships over time, and inspect the continuity memory produced by the translator—without turning the interface into another dashboard full of noise.</p>
          <div className="hero-actions">
            {novels[0] ? <Link className="button button--primary" to={`/novel/${encodeURIComponent(novels[0].novel_id)}?lang=${novels[0].lang_id}`}><span>Open first series</span><span aria-hidden="true">→</span></Link> : null}
            <a className="button button--ghost" href="#library"><span>Browse library</span><span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <aside className="landing-hero__folio" aria-label="Translation workspace summary">
          <div className="folio-rule" />
          <p className="folio-kicker">Live workspace</p>
          <div className="folio-stat"><strong>{series}</strong><span>series</span></div>
          <div className="folio-stat"><strong>{chaptersReady}</strong><span>chapters ready</span></div>
          <div className="folio-stat"><strong>{languages}</strong><span>languages</span></div>
          <p className="folio-note">The preview reads the current SQLite state. Stale chapters remain visible and explicitly marked.</p>
        </aside>
      </section>

      <section className="discovery-strip" id="library">
        <div className="discovery-strip__inner">
          <div><p className="eyebrow">Find a workspace</p><h2>Search the shelves</h2></div>
          <label className="hero-search">
            <span className="search-mark" aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Series title or language" aria-label="Search series" />
            {query && <button type="button" onClick={() => setQuery("")}>Clear</button>}
          </label>
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading section-heading--split">
          <div><p className="eyebrow">Library</p><h2>Available translation shelves</h2></div>
          <p>Each shelf is one <code>novel_id</code> + <code>lang_id</code> workspace. Progress is based on committed, non-stale translations.</p>
        </div>
        <div className="novel-grid">
          {filtered.map((novel, index) => {
            const progress = Math.min(100, ((novel.completed || 0) / Math.max(1, novel.latest_chapter || 1)) * 100);
            return (
              <Link key={`${novel.novel_id}:${novel.lang_id}`} to={`/novel/${encodeURIComponent(novel.novel_id)}?lang=${novel.lang_id}`} className="novel-card">
                <div className="novel-card__visual" aria-hidden="true">
                  <span className="novel-card__index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="novel-card__monogram">{novel.novel_id.slice(0, 1).toUpperCase()}</span>
                  <span className="novel-card__spine">{novel.lang_id.toUpperCase()}</span>
                </div>
                <div className="novel-card__body">
                  <span className="pill">{novel.lang_id.toUpperCase()}</span>
                  <h3>{titleCase(novel.novel_id)}</h3>
                  <p>{novel.completed || 0} translated · {novel.stale || 0} stale</p>
                  <div className="progress"><span style={{ width: `${progress}%` }} /></div>
                  <footer><span>Latest chapter {novel.latest_chapter || "—"}</span><span>Open shelf →</span></footer>
                </div>
              </Link>
            );
          })}
          {!filtered.length && <div className="empty-state"><strong>No matching workspace.</strong><span>{novels.length ? "Try another search." : "Run the translator, then refresh this page."}</span></div>}
        </div>
      </section>

      {!!data.recent_runs?.length && <section className="home-section pipeline-section">
        <div className="section-heading"><div><p className="eyebrow">Pipeline</p><h2>Recent translation runs</h2></div></div>
        <div className="run-list">
          {data.recent_runs.map((run) => <div className="run-row" key={run.run_id}>
            <span className={`status-dot ${run.status}`} />
            <div><strong>{titleCase(run.novel_id)}</strong><small>{run.lang_id?.toUpperCase?.() || ""}</small></div>
            <span>Chapter {run.start_chapter}–{run.end_chapter}</span>
            <span className="run-status">{run.status}</span>
            <time>{run.started_at}</time>
          </div>)}
        </div>
      </section>}

      <section className="reading-manifesto">
        <div className="reading-manifesto__grid">
          <div><p className="eyebrow">Built for continuity</p><h2>Less interface.<br />More story state.</h2></div>
          <div className="manifesto-points">
            <article><span>01</span><h3>Sequential by design</h3><p>Every chapter can inherit bounded context from the chapters and metadata that came before it.</p></article>
            <article><span>02</span><h3>Context on demand</h3><p>Entities, relationships, terminology, glossary, and arcs stay outside the prose until you inspect them.</p></article>
            <article><span>03</span><h3>Local source of truth</h3><p>The preview reflects the SQLite database produced by the translation pipeline instead of mock content.</p></article>
          </div>
        </div>
      </section>
    </div>
  );
}
