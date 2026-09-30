import React from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { MarkdownText } from "../components/markdown";

export function ReaderPage() {
  const chapter = useLoaderData();
  const [searchParams] = useSearchParams();
  const lang = searchParams.get("lang") || chapter.lang_id || "id";
  const base = `/novel/${encodeURIComponent(chapter.novel_id)}`;
  const meta = chapter.metadata || {};

  return <div className="reader-page">
    <article className="reader-article">
      <header className="reader-heading">
        <div className="reader-heading__meta"><span className="eyebrow">{lang.toUpperCase()} / Chapter {chapter.chapter_number}</span><span className={`badge ${chapter.stale ? "badge--warning" : ""}`}>{chapter.stale ? "stale" : "current"}</span></div>
        <h1>{chapter.chapter_title || `Chapter ${chapter.chapter_number}`}</h1>
        <p className="reader-heading__id">{chapter.novel_id} · chapter {String(chapter.chapter_number).padStart(4, "0")}</p>
      </header>
      <MarkdownText text={chapter.translated_text} />
    </article>

    <aside className="reader-context" aria-label="Chapter context">
      <section className="reader-context__card reader-context__card--summary"><p className="eyebrow">Continuity</p><p>{chapter.continuity_summary || "No continuity summary stored for this chapter."}</p></section>
      <section className="reader-context__card"><p className="eyebrow">Extracted here</p><div className="mini-metrics"><span><strong>{meta.entities?.length || 0}</strong>entities</span><span><strong>{meta.relationships?.length || 0}</strong>relations</span><span><strong>{meta.terminology?.length || 0}</strong>terms</span><span><strong>{meta.arcs?.length || 0}</strong>arcs</span></div></section>
      {!!meta.entities?.length && <section className="reader-context__card"><p className="eyebrow">Entities</p><div className="tag-cloud">{meta.entities.slice(0, 14).map((item) => <span key={item.entity_id}>{item.canonical_name}</span>)}</div></section>}
      <Link className="context-link" to={`${base}/atlas?lang=${lang}`}>Inspect full Story Atlas <span aria-hidden="true">→</span></Link>
    </aside>

    <nav className="reader-nav" aria-label="Chapter navigation">
      {chapter.previous_chapter ? <Link to={`${base}/chapter/${chapter.previous_chapter}?lang=${lang}`}><small>Previous</small><strong>Chapter {chapter.previous_chapter}</strong><span aria-hidden="true">←</span></Link> : <span />}
      {chapter.next_chapter ? <Link to={`${base}/chapter/${chapter.next_chapter}?lang=${lang}`}><small>Next</small><strong>Chapter {chapter.next_chapter}</strong><span aria-hidden="true">→</span></Link> : <span />}
    </nav>
  </div>;
}
