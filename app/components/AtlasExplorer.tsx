import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  DocumentMagnifyingGlassIcon,
  MapIcon,
  MagnifyingGlassIcon,
  IdentificationIcon,
  ShareIcon,
  Squares2X2Icon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { AtlasArcNavigator } from "./AtlasArcNavigator";
import { AtlasEntityChronology } from "./AtlasEntityChronology";
import { AtlasEvidenceView } from "./AtlasEvidenceView";
import { AtlasGraph } from "./AtlasGraph";
import { AtlasProfiles } from "./AtlasProfiles";
import { AtlasRelationshipMatrix } from "./AtlasRelationshipMatrix";
import { AtlasStoryline } from "./AtlasStoryline";
import { CustomSelect } from "./CustomSelect";
import { MetadataMarkdown } from "./MetadataMarkdown";
import { atlasActiveEdgesInWindow, KIND_LABELS, type AtlasData, type AtlasKind } from "~/lib/atlas";

export type AtlasViewName = "graph" | "profiles" | "storyline" | "matrix" | "chronology" | "arcs" | "evidence";

function SourceLink({ href, label = "Review source" }: { href: string; label?: string }) {
  return href ? <Link to={href}>{label}</Link> : <span className="muted">Source retained in metadata</span>;
}

export function AtlasExplorer({ atlas, initialView = "graph" }: { atlas: AtlasData; initialView?: AtlasViewName }) {
  const [view, setView] = useState<AtlasViewName>(initialView);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AtlasKind | "all">("all");
  const [evidenceLimit, setEvidenceLimit] = useState(8);
  const entities = atlas.nodes;
  const activeEdges = useMemo(() => atlasActiveEdgesInWindow(atlas), [atlas]);
  const byId = useMemo(() => new Map(atlas.nodes.map((node) => [node.id, node])), [atlas.nodes]);
  const q = query.trim().toLowerCase();
  const initial = useMemo(() => {
    const degree = new Map<string, number>();
    for (const edge of activeEdges) for (const id of [edge.source, edge.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
    return [...entities].sort((a, b) => (a.kind === "character" ? 0 : 1) - (b.kind === "character" ? 0 : 1) || (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || b.visibleFrom - a.visibleFrom)[0]?.id ?? "";
  }, [activeEdges, entities]);
  const [selectedId, setSelectedId] = useState(initial);
  const filtered = useMemo(() => entities.filter((node) => {
    if (kind !== "all" && node.kind !== kind) return false;
    return !q || `${node.label} ${node.aliases.join(" ")} ${node.description} ${node.entityType ?? ""}`.toLowerCase().includes(q);
  }), [entities, kind, q]);
  const selected = filtered.find((node) => node.id === selectedId) ?? filtered[0];
  useEffect(() => { if (initial && !entities.some((node) => node.id === selectedId)) setSelectedId(initial); }, [entities, initial, selectedId]);
  useEffect(() => { setView(initialView); }, [initialView]);
  useEffect(() => { setEvidenceLimit(8); }, [selected?.id]);
  const connections = selected ? activeEdges.filter((edge) => edge.source === selected.id || edge.target === selected.id) : [];
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
    ["graph", "Network", ShareIcon],
    ["profiles", "Profiles", IdentificationIcon],
    ["storyline", "Storyline", ClockIcon],
    ["matrix", "Matrix", Squares2X2Icon],
    ["chronology", "Character", UserCircleIcon],
    ["arcs", "Arcs & cycles", MapIcon],
    ["evidence", "Evidence", DocumentMagnifyingGlassIcon],
  ];

  return <div className="atlas-explorer">
    <div className={`atlas-safety-note${atlas.unreviewedUnlocked ? " atlas-safety-note--limited" : ""}`}>
      {atlas.unreviewedUnlocked
        ? <><strong>Spoiler metadata unlocked for {rangeLabel}.</strong><span>Normalized D1 rows are still filtered by the selected reveal boundary before serialization.</span></>
        : <><strong>Reviewed view for {rangeLabel}.</strong><span>The D1 query excludes unreviewed metadata and future reveal rows before the response reaches the browser.</span></>}
    </div>

    <div className="atlas-data-summary" aria-label="Available structured metadata">
      <div><strong>{entities.length}</strong><span>entities</span></div>
      <div><strong>{activeEdges.length}</strong><span>relationships</span></div>
      <div><strong>{atlas.facts.length}</strong><span>facts</span></div>
      <div><strong>{atlas.states.length}</strong><span>states</span></div>
      <div><strong>{atlas.events.length}</strong><span>events</span></div>
      <div><strong>{atlas.arcs.length}</strong><span>arcs</span></div>
      <div><strong>{atlas.cycles.length}</strong><span>cycles</span></div>
      <div><strong>{atlas.characteristics.length}</strong><span>profiles</span></div>
    </div>

    <div className="atlas-view-switch atlas-view-switch--research" role="group" aria-label="Story Atlas visualization">
      {views.map(([value, label, Icon]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}><Icon aria-hidden="true" /><span>{label}</span></button>)}
    </div>

    {view === "graph" ? <>
      <div className="atlas-overview">{activeKinds.map((key) => <button type="button" key={key} className={kind === key ? "is-active" : ""} onClick={() => setKind(kind === key ? "all" : key)} aria-pressed={kind === key}><strong>{entities.filter((node) => node.kind === key).length}</strong><span>{KIND_LABELS[key]}</span></button>)}</div>
      <div className="atlas-tools atlas-tools--network"><label className="atlas-search"><MagnifyingGlassIcon aria-hidden="true" /><span className="sr-only">Search atlas entities</span><input type="search" value={query} maxLength={120} placeholder="Find an entity or revealed alias..." onChange={(event) => setQuery(event.target.value)} /></label>{query || kind !== "all" ? <button className="button button--ghost" type="button" onClick={() => { setQuery(""); setKind("all"); }}>Clear filters</button> : null}</div>
      <div className="atlas-results-note"><span role="status">{filtered.length} matching entities</span><span>{reviewedEntities} reviewed · {metadataEntities} unreviewed · metadata sync #{atlas.version}</span>{atlas.integrityIssueCount ? <span>{atlas.integrityIssueCount} source integrity warning(s)</span> : null}</div>
      {!filtered.length || !selected ? <div className="empty-state"><h2>No matching entities</h2><p>Try another category or search phrase.</p></div> : <div className="atlas-layout">
        <div className="atlas-main"><div className="atlas-focus"><span>Explore explicit relationship context around</span><CustomSelect ariaLabel="Atlas focus entity" value={selected.id} onChange={select} options={filtered.map((node) => ({ value: node.id, label: `${node.label}${node.reviewed ? "" : " · metadata"}` }))} /></div><AtlasGraph atlas={atlas} selectedId={selected.id} onSelect={select} /></div>
        <aside className="atlas-inspector" aria-label="Selected entity and stored relationship evidence">
          <p className="eyebrow">{KIND_LABELS[selected.kind]} · visible from Ch. {selected.visibleFrom}</p><h2>{selected.label}</h2>
          <span className={`atlas-data-badge${selected.reviewed ? " is-reviewed" : ""}`}>{selected.reviewed ? "Reviewed boundary" : "Unreviewed metadata"}</span>
          {selected.aliases.length ? <p className="atlas-aliases">Aliases revealed by this boundary: {selected.aliases.join(", ")}</p> : null}
          <MetadataMarkdown source={selected.description || "No additional description is stored."} novelId={atlas.novelId} variant="compact" />
          {selected.source.href ? <div className="atlas-sources"><Link to={selected.source.href}><ArrowTopRightOnSquareIcon aria-hidden="true" /><span>Review {selected.source.label}</span></Link></div> : null}
          <h3>Stored relationship evidence <span>({connections.length})</span></h3>
          <p className="field-help">Only explicit structured edges are shown. For a chapter range, relationships already known before the range can remain visible when their validity overlaps it.</p>
          {connections.length ? <ol className="atlas-evidence">{connections.slice(0, evidenceLimit).map((edge) => {
            const otherId = edge.source === selected.id ? edge.target : edge.source;
            const other = byId.get(otherId);
            return <li key={edge.id}><button type="button" className="text-button" onClick={() => select(otherId)}>{other?.label ?? otherId}</button><small>{edge.label} · reveal Ch. {edge.visibleFrom}{edge.cycleId ? ` · ${edge.cycleId}` : ""} · {edge.certainty || (edge.reviewed ? "reviewed" : "metadata")}</small>{edge.evidence ? <MetadataMarkdown source={edge.evidence} novelId={atlas.novelId} variant="compact" className="metadata-markdown--evidence" /> : null}<SourceLink href={edge.sourceRef.href} /></li>;
          })}</ol> : <p className="muted">No explicit relationship edge is active for this entity inside the selected window. Nearby context may still appear without a fabricated edge.</p>}
          {connections.length > evidenceLimit ? <button className="button button--ghost atlas-more-evidence" type="button" onClick={() => setEvidenceLimit((value) => value + 8)}>Show more evidence ({connections.length - evidenceLimit} remaining)</button> : null}
        </aside>
      </div>}
    </> : null}

    {view === "profiles" ? <AtlasProfiles atlas={atlas} /> : null}
    {view === "storyline" ? <AtlasStoryline atlas={atlas} /> : null}
    {view === "matrix" ? <AtlasRelationshipMatrix atlas={atlas} /> : null}
    {view === "chronology" ? <AtlasEntityChronology atlas={atlas} /> : null}
    {view === "arcs" ? <AtlasArcNavigator atlas={atlas} /> : null}
    {view === "evidence" ? <AtlasEvidenceView atlas={atlas} /> : null}
  </div>;
}
