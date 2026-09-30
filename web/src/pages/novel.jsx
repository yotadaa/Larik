import React, { useMemo, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";

function titleCase(value = "") {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function NovelPage() {
  const data = useLoaderData();
  const [query, setQuery] = useState("");
  const [searchParams] = useSearchParams();
  const lang = searchParams.get("lang") || data.lang_id || "id";
  const chapters = useMemo(() => (data.chapters || []).filter((chapter) => !query || `${chapter.chapter_number} ${chapter.chapter_title} ${chapter.continuity_summary}`.toLowerCase().includes(query.toLowerCase())), [data.chapters, query]);
  const counts = data.metadata_counts || {};

  return <div className="novel-page stack-xl">
    <section className="novel-hero">
      <div className="novel-hero__spine" aria-hidden="true"><span>{lang.toUpperCase()}</span><strong>{String(data.completed_chapters || 0).padStart(3, "0")}</strong></div>
      <div className="novel-hero__copy">
        <Link to="/" className="back-link">← Library</Link>
        <p className="eyebrow">{lang.toUpperCase()} translation / sequential workspace</p>
        <h1>{titleCase(data.novel_id)}</h1>
        <p className="lede lede--compact">{data.completed_chapters} current chapters · {data.stale_chapters} stale. Open a chapter to read the translation or inspect the Story Atlas to review extracted continuity.</p>
        <div className="hero-actions"><Link className="button button--primary" to={`/novel/${encodeURIComponent(data.novel_id)}/atlas?lang=${lang}`}><span>Open Story Atlas</span><span aria-hidden="true">→</span></Link></div>
      </div>
    </section>

    <section className="metric-grid" aria-label="Metadata totals">
      {Object.entries(counts).map(([key, value], index) => <div className="metric" key={key}><small>{String(index + 1).padStart(2, "0")}</small><strong>{value}</strong><span>{key.replaceAll("_", " ")}</span></div>)}
    </section>

    <section className="chapter-section">
      <div className="chapter-toolbar">
        <div><p className="eyebrow">Reader</p><h2>Chapters</h2><p className="quiet">Search by number, title, or continuity summary.</p></div>
        <label className="chapter-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chapters…" /></label>
      </div>
      <div className="chapter-list">
        {chapters.map((chapter) => <Link key={chapter.chapter_number} className={`chapter-row ${chapter.stale ? "is-stale" : ""}`} to={`/novel/${encodeURIComponent(data.novel_id)}/chapter/${chapter.chapter_number}?lang=${lang}`}>
          <span className="chapter-number">{String(chapter.chapter_number).padStart(3, "0")}</span>
          <div className="chapter-row__copy"><strong>{chapter.chapter_title || `Chapter ${chapter.chapter_number}`}</strong><p>{chapter.continuity_summary || "No continuity summary."}</p></div>
          <div className="chapter-meta"><span>{chapter.translated_chars?.toLocaleString?.() || chapter.translated_chars} chars</span><span className={chapter.stale ? "badge badge--warning" : "badge"}>{chapter.stale ? "stale" : "current"}</span></div>
          <span className="chapter-arrow" aria-hidden="true">→</span>
        </Link>)}
      </div>
      {!chapters.length && <div className="empty-state"><strong>No matching chapter.</strong><span>Try a different search.</span></div>}
    </section>
  </div>;
}
