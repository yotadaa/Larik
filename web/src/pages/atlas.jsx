import React, { useMemo, useState } from "react";
import { Link, useLoaderData, useParams, useSearchParams } from "react-router";

const TABS = ["entities", "relationships", "terminology", "glossary", "arcs", "runs"];

function titleCase(value = "") {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AtlasPage() {
  const data = useLoaderData();
  const { novelId } = useParams();
  const [params] = useSearchParams();
  const lang = params.get("lang") || "id";
  const [tab, setTab] = useState("entities");
  const [query, setQuery] = useState("");
  const items = useMemo(() => (data[tab] || []).filter((item) => !query || JSON.stringify(item).toLowerCase().includes(query.toLowerCase())), [data, tab, query]);

  return <div className="atlas-page stack-xl">
    <header className="page-intro page-intro--compact">
      <Link className="back-link" to={`/novel/${encodeURIComponent(novelId)}?lang=${lang}`}>← Chapters</Link>
      <p className="eyebrow">{titleCase(decodeURIComponent(novelId))} / story reference</p>
      <h1>Story Atlas</h1>
      <p>Inspect the latest non-stale continuity state stored for this translation. Relationships remain temporal, terminology stays canonical, and every section is filtered independently.</p>
    </header>

    <section className="atlas-boundary-card">
      <div className="atlas-boundary-card__mark" aria-hidden="true">A</div>
      <div><p className="eyebrow">Current scope</p><h2>Latest committed translation state.</h2><p>This preview intentionally reads the existing SQLite metadata instead of inferring new facts at request time.</p></div>
      <div className="atlas-total"><strong>{TABS.reduce((sum, name) => sum + (data[name]?.length || 0), 0)}</strong><span>records visible</span></div>
    </section>

    <nav className="reference-nav" aria-label="Story Atlas sections">
      {TABS.map((name, index) => <button className={tab === name ? "is-active" : ""} key={name} onClick={() => setTab(name)}><span>{name}</span><small>{data[name]?.length || 0}</small><em>{String(index + 1).padStart(2, "0")}</em></button>)}
    </nav>

    <section>
      <div className="chapter-toolbar atlas-toolbar"><div><p className="eyebrow">{tab}</p><h2>{tab === "relationships" ? "Entity relationships" : titleCase(tab)}</h2><p className="quiet">{items.length} visible record{items.length === 1 ? "" : "s"}</p></div><label className="chapter-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Filter ${tab}…`} /></label></div>
      <div className="atlas-grid">{items.map((item, index) => <AtlasCard key={item.entity_id || item.relationship_id || item.term_id || item.glossary_id || item.arc_id || item.run_id || index} type={tab} item={item} index={index} />)}</div>
      {!items.length && <div className="empty-state"><strong>No matching {tab}.</strong><span>Try another filter or translate more chapters.</span></div>}
    </section>
  </div>;
}

function AtlasCard({ type, item, index }) {
  const number = String(index + 1).padStart(2, "0");
  if (type === "entities") return <article className="atlas-card"><div className="card-kicker"><span>{number}</span><span className="pill">{item.entity_type}</span><span>ch. {item.chapter_number}</span></div><h3>{item.canonical_name || item.source_name}</h3><p>{item.description || "No description."}</p><small>{item.entity_id}</small>{!!item.aliases?.length && <div className="tag-cloud">{item.aliases.map((alias) => <span key={alias}>{alias}</span>)}</div>}</article>;
  if (type === "relationships") return <article className="atlas-card relationship-card"><div className="card-kicker"><span>{number}</span><span>ch. {item.chapter_number}</span></div><div className="relation-line"><span>{item.source_entity_id}</span><b>{item.name}</b><span>{item.target_entity_id}</span></div><p>{item.description || "No relationship rationale."}</p><small>{item.status}</small></article>;
  if (type === "terminology") return <article className="atlas-card"><div className="card-kicker"><span>{number}</span><span className="pill">{item.translation_rule}</span><span>{item.category}</span></div><h3>{item.canonical_term}</h3><p className="term-source">{item.source_term}</p><p>{item.description}</p></article>;
  if (type === "glossary") return <article className="atlas-card"><div className="card-kicker"><span>{number}</span><span className="pill">{item.category || "lore"}</span><span>ch. {item.chapter_number}</span></div><h3>{item.term}</h3><p>{item.definition}</p></article>;
  if (type === "arcs") return <article className="atlas-card"><div className="card-kicker"><span>{number}</span><span className="pill">{item.status}</span><span>{item.start_chapter || "?"} → {item.end_chapter || "…"}</span></div><h3>{item.name}</h3><p>{item.summary}</p><small>{item.chapter_role}</small></article>;
  return <article className="atlas-card"><div className="card-kicker"><span>{number}</span><span className={`pill ${item.status === "failed" ? "pill--danger" : ""}`}>{item.status}</span><span>{item.started_at}</span></div><h3>Chapter {item.start_chapter}–{item.end_chapter}</h3><p>{item.message || "No run message."}</p><small>{item.run_id}</small></article>;
}
