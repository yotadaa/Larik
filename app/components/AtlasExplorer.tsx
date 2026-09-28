import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowTopRightOnSquareIcon, ClockIcon, ListBulletIcon, MagnifyingGlassIcon, ShareIcon } from "@heroicons/react/24/outline";
import { AtlasGraph } from "./AtlasGraph";
import { AtlasStoryline } from "./AtlasStoryline";
import { CustomSelect } from "./CustomSelect";
import { Markdown } from "./Markdown";
import { atlasEdgesInWindow, atlasFactRecordsInWindow, atlasFactsInWindow, KIND_LABELS, type AtlasData, type AtlasKind } from "~/lib/atlas";

type AtlasViewName = "graph" | "storyline" | "facts" | "events" | "states" | "scenes" | "arcs";

function SourceLink({ href, label = "Review source" }: { href: string; label?: string }) {
  return href ? <Link to={href}>{label}</Link> : <span className="muted">Source retained in metadata</span>;
}

export function AtlasExplorer({ atlas }: { atlas: AtlasData }) {
  const [view, setView] = useState<AtlasViewName>("graph");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AtlasKind | "all">("all");
  const [limit, setLimit] = useState(30);
  const [evidenceLimit, setEvidenceLimit] = useState(8);
  const entities = useMemo(() => atlasFactsInWindow(atlas), [atlas]);
  const factRecords = useMemo(() => atlasFactRecordsInWindow(atlas), [atlas]);
  const windowEdges = useMemo(() => atlasEdgesInWindow(atlas), [atlas]);
  const byId = useMemo(() => new Map(atlas.nodes.map((node) => [node.id, node])), [atlas.nodes]);
  const q = query.trim().toLowerCase();

  const initial = useMemo(() => {
    const degree = new Map<string, number>();
    for (const edge of windowEdges) for (const id of [edge.source, edge.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
    return [...entities].sort((a, b) => (a.kind === "character" ? 0 : 1) - (b.kind === "character" ? 0 : 1) || (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || b.visibleFrom - a.visibleFrom)[0]?.id ?? "";
  }, [entities, windowEdges]);
  const [selectedId, setSelectedId] = useState(initial);
  const filtered = useMemo(() => entities.filter((node) => {
    if (kind !== "all" && node.kind !== kind) return false;
    return !q || `${node.label} ${node.aliases.join(" ")} ${node.description} ${node.entityType ?? ""}`.toLowerCase().includes(q);
  }), [entities, kind, q]);
  const filteredFacts = useMemo(() => factRecords.filter((fact) => {
    const subject = byId.get(fact.subjectId);
    if (kind !== "all" && subject?.kind !== kind) return false;
    return !q || `${subject?.label ?? fact.subjectId} ${fact.predicate} ${fact.objectValue} ${fact.epistemicStatus}`.toLowerCase().includes(q);
  }), [factRecords, byId, kind, q]);
  const filteredStates = useMemo(() => atlas.states.filter((state) => {
    const entity = byId.get(state.entityId);
    if (kind !== "all" && entity?.kind !== kind) return false;
    return !q || `${entity?.label ?? state.entityId} ${state.property} ${state.value} ${state.cycleId}`.toLowerCase().includes(q);
  }), [atlas.states, byId, kind, q]);
  const filteredEvents = useMemo(() => atlas.events.filter((event) => !q || `${event.label} ${event.summary} ${event.kind} ${event.entityIds.map((id) => byId.get(id)?.label ?? id).join(" ")}`.toLowerCase().includes(q)), [atlas.events, byId, q]);
  const filteredScenes = useMemo(() => atlas.scenes.filter((scene) => !q || `${scene.summary} ${scene.timeMarker} ${scene.povEntityId} ${scene.participantIds.join(" ")}`.toLowerCase().includes(q)), [atlas.scenes, q]);
  const filteredArcs = useMemo(() => atlas.arcs.filter((arc) => !q || `${arc.title} ${arc.summary} ${arc.status}`.toLowerCase().includes(q)), [atlas.arcs, q]);

  const selected = filtered.find((node) => node.id === selectedId) ?? filtered[0];
  useEffect(() => { if (initial && !entities.some((node) => node.id === selectedId)) setSelectedId(initial); }, [entities, initial, selectedId]);
  useEffect(() => { setEvidenceLimit(8); }, [selected?.id]);
  const connections = selected ? windowEdges.filter((edge) => edge.source === selected.id || edge.target === selected.id) : [];
  const select = (id: string) => {
    setSelectedId(id);
    if (!filtered.some((node) => node.id === id)) { setKind("all"); setQuery(""); }
  };
  const reviewedEntities = entities.filter((node) => node.reviewed).length;
  const metadataEntities = entities.length - reviewedEntities;
  const activeKinds = (Object.keys(KIND_LABELS) as AtlasKind[]).filter((key) => entities.some((node) => node.kind === key));
  const rangeLabel = atlas.scope === "through"
    ? `chapters 1–${atlas.through.ordinal}`
    : atlas.scope === "all"
      ? `the full story (chapters ${atlas.from.ordinal}–${atlas.through.ordinal})`
      : atlas.from.ordinal === atlas.through.ordinal
        ? `chapter ${atlas.from.ordinal}`
        : `chapters ${atlas.from.ordinal}–${atlas.through.ordinal}`;

  const views: [AtlasViewName, string, typeof ShareIcon][] = [
    ["graph", "Network", ShareIcon], ["storyline", "Storyline", ClockIcon], ["facts", "Facts", ListBulletIcon],
    ["events", "Events", ClockIcon], ["states", "States", ListBulletIcon], ["scenes", "Scenes", ListBulletIcon], ["arcs", "Arcs", ClockIcon],
  ];

  return <div className="atlas-explorer">
    <div className={`atlas-safety-note${atlas.unreviewedUnlocked ? " atlas-safety-note--limited" : ""}`}>
      {atlas.unreviewedUnlocked
        ? <><strong>Spoiler metadata unlocked for {rangeLabel}.</strong><span>Rows are loaded from normalized Markdown metadata in D1 and filtered by reveal/chapter boundary before serialization.</span></>
        : <><strong>Reviewed view for {rangeLabel}.</strong><span>The D1 query excludes unreviewed metadata and future reveal rows before the response reaches the browser.</span></>}
    </div>
    <div className="atlas-overview">{activeKinds.map((key) => <button type="button" key={key} className={kind === key ? "is-active" : ""}
      onClick={() => { setKind(kind === key ? "all" : key); setLimit(30); }} aria-pressed={kind === key}><strong>{entities.filter((node) => node.kind === key).length}</strong><span>{KIND_LABELS[key]}</span></button>)}</div>
    <div className="atlas-tools">
      <label className="atlas-search"><MagnifyingGlassIcon aria-hidden="true" /><span className="sr-only">Search atlas metadata</span><input type="search" value={query} maxLength={120} placeholder="Find an entity, fact, event, state, scene, or arc..." onChange={(event) => { setQuery(event.target.value); setLimit(30); }} /></label>
      <div className="atlas-view-switch" role="group" aria-label="Atlas view">{views.map(([value, label, Icon]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => { setView(value); setLimit(30); }}><Icon aria-hidden="true" /><span>{label}</span></button>)}</div>
    </div>
    <div className="atlas-results-note"><span role="status">{filtered.length} matching entities</span><span>{reviewedEntities} reviewed · {metadataEntities} unreviewed · {atlas.facts.length} atomic facts · {atlas.events.length} events · metadata sync #{atlas.version}</span>{atlas.integrityIssueCount ? <span>{atlas.integrityIssueCount} source integrity warning(s)</span> : null}{query || kind !== "all" ? <button className="text-button" type="button" onClick={() => { setQuery(""); setKind("all"); }}>Clear filters</button> : null}</div>

    {view === "storyline" ? <AtlasStoryline atlas={atlas} /> : view === "events" ? <section className="atlas-timeline" aria-label="Story event timeline">
      <p className="atlas-timeline-note">Stored atomic events for {rangeLabel}; no event is inferred from chapter prose during this request.</p>
      {!filteredEvents.length ? <div className="empty-state"><h2>No event rows in this window</h2><p>The metadata ledger may not yet be backfilled for this range.</p></div> : filteredEvents.slice(0, limit).map((event) => <article className={`atlas-entry${event.reviewed ? " is-reviewed" : " is-metadata"}`} key={event.id}>
        <div className="atlas-entry-marker">Ch. {event.chapterOrdinal}{event.sceneOrder != null ? ` · scene ${event.sceneOrder}` : ""}<span className={`atlas-data-badge${event.reviewed ? " is-reviewed" : ""}`}>{event.reviewed ? "Reviewed" : "Unreviewed"}</span></div><div><h2>{event.label}</h2><Markdown source={event.summary || "No stored summary."} stripHeading /><div className="atlas-entry-actions"><SourceLink href={event.source.href} label="Read chapter source" /><span>{event.kind}{event.cycleId ? ` · ${event.cycleId}` : ""}</span></div></div>
      </article>)}
      {filteredEvents.length > limit ? <button className="button button--ghost" type="button" onClick={() => setLimit((value) => value + 30)}>Show more events</button> : null}
    </section> : view === "facts" ? <section className="atlas-entry-list" aria-label="Atomic Story Atlas facts">
      {atlas.facts.length ? (!filteredFacts.length ? <div className="empty-state"><h2>No matching atomic facts</h2><p>Try another entity, category, or chapter range.</p></div> : filteredFacts.slice(0, limit).map((fact) => {
        const subject = byId.get(fact.subjectId);
        return <article className={`atlas-entry${fact.reviewed ? " is-reviewed" : " is-metadata"}`} key={fact.id}>
          <div className="atlas-entry-marker">Ch. {fact.visibleFrom}<span className={`atlas-data-badge${fact.reviewed ? " is-reviewed" : ""}`}>{fact.epistemicStatus || "unknown"}</span></div>
          <div><h2>{subject?.label ?? fact.subjectId} · {fact.predicate.replaceAll("_", " ")}</h2><p>{fact.objectValue || "No stored value."}</p>{fact.evidence ? <blockquote>{fact.evidence}</blockquote> : null}<div className="atlas-entry-actions"><SourceLink href={fact.source.href} /><span>{fact.valueType || "value"}{fact.sourceType ? ` · ${fact.sourceType}` : ""}</span></div></div>
        </article>;
      })) : <div className="empty-state"><h2>Legacy Atlas dataset</h2><p>This database has not been synchronized with metadata v2 yet. Run the new database sync to populate atomic facts.</p></div>}
      {filteredFacts.length > limit ? <button className="button button--ghost" type="button" onClick={() => setLimit((value) => value + 30)}>Show 30 more</button> : null}
    </section> : view === "states" ? <section className="atlas-entry-list" aria-label="Entity state timeline">
      {!filteredStates.length ? <div className="empty-state"><h2>No state rows in this window</h2><p>State history remains empty until that range is explicitly recorded in states.md.</p></div> : filteredStates.slice(0, limit).map((state) => {
        const entity = byId.get(state.entityId);
        return <article className={`atlas-entry${state.reviewed ? " is-reviewed" : " is-metadata"}`} key={state.id}><div className="atlas-entry-marker">Ch. {state.visibleFrom}<span className={`atlas-data-badge${state.reviewed ? " is-reviewed" : ""}`}>{state.certainty || "stored"}</span></div><div><h2>{entity?.label ?? state.entityId} · {state.property.replaceAll("_", " ")}</h2><p>{state.value}</p><div className="atlas-entry-actions"><SourceLink href={state.source.href} /><span>{state.cycleId || state.valueType}</span></div></div></article>;
      })}
      {filteredStates.length > limit ? <button className="button button--ghost" type="button" onClick={() => setLimit((value) => value + 30)}>Show more states</button> : null}
    </section> : view === "scenes" ? <section className="atlas-entry-list" aria-label="Story scenes">
      {!filteredScenes.length ? <div className="empty-state"><h2>No scene rows in this window</h2><p>Scene metadata is shown only where scenes.md has structured entries.</p></div> : filteredScenes.slice(0, limit).map((scene) => <article className={`atlas-entry${scene.reviewed ? " is-reviewed" : " is-metadata"}`} key={scene.id}><div className="atlas-entry-marker">Ch. {scene.chapterOrdinal}{scene.sceneOrder != null ? ` · #${scene.sceneOrder}` : ""}<span className={`atlas-data-badge${scene.reviewed ? " is-reviewed" : ""}`}>{scene.reviewed ? "Reviewed" : "Unreviewed"}</span></div><div><h2>{scene.id}</h2><Markdown source={scene.summary || "No stored scene summary."} stripHeading /><div className="atlas-entry-actions"><SourceLink href={scene.source.href} /><span>{scene.cycleId || "scene"}{scene.timeMarker ? ` · ${scene.timeMarker}` : ""}</span></div></div></article>)}
      {filteredScenes.length > limit ? <button className="button button--ghost" type="button" onClick={() => setLimit((value) => value + 30)}>Show more scenes</button> : null}
    </section> : view === "arcs" ? <section className="atlas-entry-list" aria-label="Story arcs and regression cycles">
      {atlas.cycles.length ? <div className="atlas-results-note"><span>{atlas.cycles.length} cycle(s) overlap this window</span><span>{atlas.cycles.map((cycle) => `${cycle.id}: Ch. ${cycle.startChapter}–${cycle.endChapter ?? "…"}`).join(" · ")}</span></div> : null}
      {!filteredArcs.length ? <div className="empty-state"><h2>No arc rows in this window</h2><p>Arc ranges come directly from arcs.md.</p></div> : filteredArcs.slice(0, limit).map((arc) => <article className={`atlas-entry${arc.reviewed ? " is-reviewed" : " is-metadata"}`} key={arc.id}><div className="atlas-entry-marker">Ch. {arc.startChapter}–{arc.endChapter ?? "…"}<span className={`atlas-data-badge${arc.reviewed ? " is-reviewed" : ""}`}>{arc.status || "arc"}</span></div><div><h2>{arc.title}</h2><Markdown source={arc.summary || "No stored arc summary."} stripHeading /><div className="atlas-entry-actions"><SourceLink href={arc.source.href} /><span>{arc.cycleIds.join(", ") || "story arc"}</span></div></div></article>)}
      {filteredArcs.length > limit ? <button className="button button--ghost" type="button" onClick={() => setLimit((value) => value + 30)}>Show more arcs</button> : null}
    </section> : !filtered.length || !selected ? <div className="empty-state"><h2>No matching entities in this window</h2><p>Try another chapter range or category.</p></div> : <div className="atlas-layout">
      <div className="atlas-main"><div className="atlas-focus"><span>Explore network context around</span><CustomSelect ariaLabel="Atlas focus entity" value={selected.id} onChange={select} options={filtered.map((node) => ({ value: node.id, label: `${node.label}${node.reviewed ? "" : " · metadata"}` }))} /></div><AtlasGraph atlas={atlas} selectedId={selected.id} onSelect={select} /></div>
      <aside className="atlas-inspector" aria-label="Selected entity and stored relationship evidence">
        <p className="eyebrow">{KIND_LABELS[selected.kind]} · visible from Ch. {selected.visibleFrom}</p><h2>{selected.label}</h2>
        <span className={`atlas-data-badge${selected.reviewed ? " is-reviewed" : ""}`}>{selected.reviewed ? "Reviewed boundary" : "Unreviewed metadata"}</span>
        {selected.aliases.length ? <p className="atlas-aliases">Aliases revealed by this boundary: {selected.aliases.join(", ")}</p> : null}
        <Markdown source={selected.description || "No additional description is stored."} />
        {selected.source.href ? <div className="atlas-sources"><Link to={selected.source.href}><ArrowTopRightOnSquareIcon aria-hidden="true" /><span>Review {selected.source.label}</span></Link></div> : null}
        <h3>Stored relationship evidence <span>({connections.length})</span></h3>
        <p className="field-help">Edges are read from structured relationship rows. Legacy datasets can still contain structural metadata edges, which remain labeled as such.</p>
        {connections.length ? <ol className="atlas-evidence">{connections.slice(0, evidenceLimit).map((edge) => {
          const otherId = edge.source === selected.id ? edge.target : edge.source;
          const other = byId.get(otherId);
          return <li key={edge.id}><button type="button" className="text-button" onClick={() => select(otherId)}>{other?.label ?? otherId}</button><small>{edge.label} · reveal Ch. {edge.visibleFrom} · {edge.certainty || (edge.reviewed ? "reviewed" : "metadata")}</small>{edge.evidence ? <blockquote>{edge.evidence}</blockquote> : null}<SourceLink href={edge.sourceRef.href} /></li>;
        })}</ol> : <p className="muted">No stored relationship edge is available for this entity inside the selected window. Nearby reveal-context nodes may still appear without a fabricated edge.</p>}
        {connections.length > evidenceLimit ? <button className="button button--ghost atlas-more-evidence" type="button" onClick={() => setEvidenceLimit((value) => value + 8)}>Show more evidence ({connections.length - evidenceLimit} remaining)</button> : null}
      </aside>
    </div>}
  </div>;
}
