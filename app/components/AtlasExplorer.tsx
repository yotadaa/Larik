import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowTopRightOnSquareIcon, ClockIcon, ListBulletIcon, MagnifyingGlassIcon, ShareIcon } from "@heroicons/react/24/outline";
import { AtlasGraph } from "./AtlasGraph";
import { AtlasStoryline } from "./AtlasStoryline";
import { CustomSelect } from "./CustomSelect";
import { Markdown } from "./Markdown";
import { atlasEdgesInWindow, atlasFactsInWindow, KIND_LABELS, type AtlasData, type AtlasKind } from "~/lib/atlas";

export function AtlasExplorer({ atlas }: { atlas: AtlasData }) {
  const [view, setView] = useState<"graph" | "storyline" | "list" | "timeline">("graph");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AtlasKind | "all">("all");
  const [limit, setLimit] = useState(30);
  const [evidenceLimit, setEvidenceLimit] = useState(8);
  const facts = useMemo(() => atlasFactsInWindow(atlas), [atlas]);
  const windowEdges = useMemo(() => atlasEdgesInWindow(atlas), [atlas]);
  const initial = useMemo(() => {
    const degree = new Map<string, number>();
    for (const edge of windowEdges) for (const id of [edge.source, edge.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
    return [...facts].sort((a, b) => (a.kind === "character" ? 0 : 1) - (b.kind === "character" ? 0 : 1) || (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || b.visibleFrom - a.visibleFrom)[0]?.id ?? "";
  }, [facts, windowEdges]);
  const [selectedId, setSelectedId] = useState(initial);
  const filtered = useMemo(() => facts.filter((node) => {
    if (kind !== "all" && node.kind !== kind) return false;
    const q = query.trim().toLowerCase();
    return !q || `${node.label} ${node.aliases.join(" ")} ${node.description}`.toLowerCase().includes(q);
  }), [facts, kind, query]);
  const selected = filtered.find((node) => node.id === selectedId) ?? filtered[0];
  useEffect(() => { if (initial && !facts.some((node) => node.id === selectedId)) setSelectedId(initial); }, [facts, initial, selectedId]);
  useEffect(() => { setEvidenceLimit(8); }, [selected?.id]);
  const connections = selected ? windowEdges.filter((edge) => edge.source === selected.id || edge.target === selected.id) : [];
  const byId = useMemo(() => new Map(atlas.nodes.map((node) => [node.id, node])), [atlas.nodes]);
  const select = (id: string) => {
    setSelectedId(id);
    if (!filtered.some((node) => node.id === id)) { setKind("all"); setQuery(""); }
  };
  const reviewedFacts = facts.filter((node) => node.reviewed).length;
  const metadataFacts = facts.length - reviewedFacts;
  const rangeLabel = atlas.scope === "through"
    ? `chapters 1–${atlas.through.ordinal}`
    : atlas.scope === "all"
      ? `the full story (chapters ${atlas.from.ordinal}–${atlas.through.ordinal})`
      : atlas.from.ordinal === atlas.through.ordinal
        ? `chapter ${atlas.from.ordinal}`
        : `chapters ${atlas.from.ordinal}–${atlas.through.ordinal}`;

  return <div className="atlas-explorer">
    <div className={`atlas-safety-note${atlas.unreviewedUnlocked ? " atlas-safety-note--limited" : ""}`}>
      {atlas.unreviewedUnlocked ? <><strong>Spoiler metadata unlocked for {rangeLabel}.</strong><span>Reviewed rows and metadata-derived rows are visually labeled. Nothing is inferred from chapter prose during this request.</span></> : <><strong>Reviewed view for {rangeLabel}.</strong><span>The database query excludes unreviewed metadata and every fact outside this selected boundary.</span></>}
    </div>
    <div className="atlas-overview">{(Object.keys(KIND_LABELS) as AtlasKind[]).map((key) => <button type="button" key={key} className={kind === key ? "is-active" : ""}
      onClick={() => { setKind(kind === key ? "all" : key); setLimit(30); }} aria-pressed={kind === key}><strong>{facts.filter((node) => node.kind === key).length}</strong><span>{KIND_LABELS[key]}</span></button>)}</div>
    <div className="atlas-tools">
      <label className="atlas-search"><MagnifyingGlassIcon aria-hidden="true" /><span className="sr-only">Search atlas</span><input type="search" value={query} maxLength={120} placeholder="Find a character, place, term, or item..." onChange={(event) => { setQuery(event.target.value); setLimit(30); }} /></label>
      <div className="atlas-view-switch" role="group" aria-label="Atlas view">{([
        ["graph", "Network", ShareIcon], ["storyline", "Storyline", ClockIcon], ["list", "Facts", ListBulletIcon], ["timeline", "Events", ClockIcon],
      ] as const).map(([value, label, Icon]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => { setView(value); setLimit(30); }}><Icon aria-hidden="true" /><span>{label}</span></button>)}</div>
    </div>
    <div className="atlas-results-note"><span role="status">{filtered.length} matching facts</span><span>{reviewedFacts} reviewed · {metadataFacts} metadata-derived · knowledge v{atlas.version}</span>{query || kind !== "all" ? <button className="text-button" type="button" onClick={() => { setQuery(""); setKind("all"); }}>Clear filters</button> : null}</div>

    {view === "storyline" ? <AtlasStoryline atlas={atlas} /> : view === "timeline" ? <section className="atlas-timeline" aria-label="Story event timeline">
      <p className="atlas-timeline-note">Events are limited to {rangeLabel}. <strong>Reviewed</strong> entries are curated facts; <strong>recap metadata</strong> entries are stored chapter summaries and may contain spoilers.</p>
      {atlas.events.slice(0, limit).map((event) => <article className={`atlas-entry${event.reviewed ? " is-reviewed" : " is-metadata"}`} key={event.id}>
        <div className="atlas-entry-marker">Ch. {event.chapterOrdinal}<span className={`atlas-data-badge${event.reviewed ? " is-reviewed" : ""}`}>{event.reviewed ? "Reviewed" : "Recap metadata"}</span></div><div><h2>{event.label}</h2><Markdown source={event.summary || "No stored summary."} stripHeading /><div className="atlas-entry-actions"><Link to={event.source.href}>Read chapter source</Link><span>{event.kind}</span></div></div>
      </article>)}
      {atlas.events.length > limit ? <button className="button button--ghost" type="button" onClick={() => setLimit((value) => value + 30)}>Show more events</button> : null}
    </section> : view === "list" ? <section className="atlas-entry-list" aria-label="Story Atlas facts">
      {!filtered.length ? <div className="empty-state"><h2>No matching facts in this window</h2><p>Try a different name, category, or chapter range.</p></div> : filtered.slice(0, limit).map((node) => <article className={`atlas-entry${node.reviewed ? " is-reviewed" : " is-metadata"}`} key={node.id}>
        <div className="atlas-entry-marker">{KIND_LABELS[node.kind]} · Ch. {node.visibleFrom}<span className={`atlas-data-badge${node.reviewed ? " is-reviewed" : ""}`}>{node.reviewed ? "Reviewed" : "Metadata"}</span></div><div><h2>{node.label}</h2><Markdown source={node.description || "No description stored."} /><div className="atlas-entry-actions"><button type="button" className="text-button" onClick={() => { select(node.id); setView("graph"); }}>Explore network context</button><Link to={node.source.href}>Review source</Link></div></div>
      </article>)}
      {filtered.length > limit ? <button className="button button--ghost" type="button" onClick={() => setLimit((value) => value + 30)}>Show 30 more</button> : null}
    </section> : !filtered.length || !selected ? <div className="empty-state"><h2>No matching facts in this window</h2><p>Try another chapter range or category.</p></div> : <div className="atlas-layout">
      <div className="atlas-main"><div className="atlas-focus"><span>Explore network context around</span><CustomSelect ariaLabel="Atlas focus entity" value={selected.id} onChange={select} options={filtered.map((node) => ({ value: node.id, label: `${node.label}${node.reviewed ? "" : " · metadata"}` }))} /></div><AtlasGraph atlas={atlas} selectedId={selected.id} onSelect={select} /></div>
      <aside className="atlas-inspector" aria-label="Selected fact and stored connection evidence">
        <p className="eyebrow">{KIND_LABELS[selected.kind]} · visible from Ch. {selected.visibleFrom}</p><h2>{selected.label}</h2>
        <span className={`atlas-data-badge${selected.reviewed ? " is-reviewed" : ""}`}>{selected.reviewed ? "Manually reviewed" : "Metadata-derived"}</span>
        {selected.aliases.length ? <p className="atlas-aliases">Also indexed as: {selected.aliases.join(", ")}</p> : null}
        <Markdown source={selected.description || "No additional description is stored."} />
        <div className="atlas-sources"><Link to={selected.source.href}><ArrowTopRightOnSquareIcon aria-hidden="true" /><span>Review {selected.source.label}</span></Link></div>
        <h3>Stored connection evidence <span>({connections.length})</span></h3>
        <p className="field-help">Reviewed edges are story relationships. Metadata edges are structural links such as “first indexed in the same chapter” and are never presented as a verified relationship.</p>
        {connections.length ? <ol className="atlas-evidence">{connections.slice(0, evidenceLimit).map((edge) => {
          const otherId = edge.source === selected.id ? edge.target : edge.source;
          const other = byId.get(otherId);
          return <li key={edge.id}><button type="button" className="text-button" onClick={() => select(otherId)}>{other?.label ?? otherId}</button><small>{edge.label} · Ch. {edge.visibleFrom} · {edge.reviewed ? "reviewed" : "metadata"}</small><blockquote>{edge.evidence}</blockquote><Link to={edge.sourceRef.href}>Review source</Link></li>;
        })}</ol> : <p className="muted">No stored connection is available for this entity inside the selected window. The Network still shows nearby reveal-context facts without drawing a fake relationship line.</p>}
        {connections.length > evidenceLimit ? <button className="button button--ghost atlas-more-evidence" type="button" onClick={() => setEvidenceLimit((value) => value + 8)}>Show more evidence ({connections.length - evidenceLimit} remaining)</button> : null}
      </aside>
    </div>}
  </div>;
}
