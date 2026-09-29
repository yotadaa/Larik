import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { CustomSelect } from "./CustomSelect";
import { MetadataMarkdown } from "./MetadataMarkdown";
import { atlasActiveEdgesInWindow, atlasWindowBounds, type AtlasData, type AtlasNode } from "~/lib/atlas";

type Activity = {
  id: string;
  chapter: number;
  kind: "state" | "event" | "fact" | "relation";
  title: string;
  detail: string;
  href: string;
  reviewed: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function AtlasEntityChronology({ atlas }: { atlas: AtlasData }) {
  const { start, end } = atlasWindowBounds(atlas);
  const byId = useMemo(() => new Map(atlas.nodes.map((node) => [node.id, node])), [atlas.nodes]);
  const activeEdges = useMemo(() => atlasActiveEdgesInWindow(atlas), [atlas]);
  const activityCount = useMemo(() => {
    const counts = new Map<string, number>();
    const add = (id: string) => id && counts.set(id, (counts.get(id) ?? 0) + 1);
    atlas.states.forEach((row) => add(row.entityId));
    atlas.facts.forEach((row) => add(row.subjectId));
    atlas.events.forEach((row) => row.entityIds.forEach(add));
    activeEdges.forEach((row) => { add(row.source); add(row.target); });
    return counts;
  }, [atlas.events, atlas.facts, atlas.states, activeEdges]);
  const entities = useMemo(() => atlas.nodes.filter((node) => activityCount.has(node.id)).sort((a, b) => (activityCount.get(b.id) ?? 0) - (activityCount.get(a.id) ?? 0) || a.label.localeCompare(b.label)), [atlas.nodes, activityCount]);
  const [entityId, setEntityId] = useState(() => entities.find((node) => node.id === "char:seo-eun-hyun")?.id ?? entities[0]?.id ?? "");
  const entity = byId.get(entityId) ?? entities[0];
  const states = useMemo(() => atlas.states.filter((state) => state.entityId === entity?.id), [atlas.states, entity?.id]);
  const properties = useMemo(() => [...new Set(states.map((state) => state.property))].sort(), [states]);
  const [property, setProperty] = useState("all");
  useEffect(() => {
    if (property !== "all" && !properties.includes(property)) setProperty("all");
  }, [properties, property]);
  const shownStates = property === "all" ? states : states.filter((state) => state.property === property);
  const events = useMemo(() => atlas.events.filter((event) => entity && event.entityIds.includes(entity.id)), [atlas.events, entity]);
  const facts = useMemo(() => atlas.facts.filter((fact) => fact.subjectId === entity?.id), [atlas.facts, entity?.id]);
  const edges = useMemo(() => activeEdges.filter((edge) => edge.source === entity?.id || edge.target === entity?.id), [activeEdges, entity?.id]);
  const rows = [...new Set(shownStates.map((state) => state.property))];
  const left = 150;
  const width = Math.min(2800, Math.max(900, 260 + (end - start + 1) * 18));
  const right = width - 55;
  const rowGap = 58;
  const top = 62;
  const eventY = top + Math.max(1, rows.length) * rowGap + 24;
  const factY = eventY + 44;
  const relationY = factY + 44;
  const height = relationY + 72;
  const x = (chapter: number) => left + ((clamp(chapter, start, end) - start) / Math.max(1, end - start)) * (right - left);
  const tickStep = end - start <= 12 ? 1 : end - start <= 40 ? 5 : end - start <= 90 ? 10 : 20;
  const ticks = Array.from({ length: Math.ceil((end - start + 1) / tickStep) }, (_, index) => start + index * tickStep).filter((value) => value <= end);
  if (!ticks.includes(end)) ticks.push(end);

  const activities = useMemo<Activity[]>(() => {
    if (!entity) return [];
    const result: Activity[] = [];
    for (const state of states) result.push({ id: state.id, chapter: state.visibleFrom, kind: "state", title: `${state.property.replaceAll("_", " ")}: ${state.value}`, detail: state.evidence, href: state.source.href, reviewed: state.reviewed });
    for (const event of events) result.push({ id: event.id, chapter: event.chapterOrdinal, kind: "event", title: event.summary || event.label, detail: event.evidence, href: event.source.href, reviewed: event.reviewed });
    for (const fact of facts) result.push({ id: fact.id, chapter: fact.visibleFrom, kind: "fact", title: `${fact.predicate.replaceAll("_", " ")}: ${fact.objectValue}`, detail: fact.evidence, href: fact.source.href, reviewed: fact.reviewed });
    for (const edge of edges) {
      const otherId = edge.source === entity.id ? edge.target : edge.source;
      result.push({ id: edge.id, chapter: edge.visibleFrom, kind: "relation", title: `${edge.label} · ${byId.get(otherId)?.label ?? otherId}`, detail: edge.evidence, href: edge.sourceRef.href, reviewed: edge.reviewed });
    }
    return result.sort((a, b) => a.chapter - b.chapter || a.kind.localeCompare(b.kind)).slice(-24);
  }, [byId, edges, entity, events, facts, states]);

  if (!entity) return <section className="atlas-visual-card empty-state"><h2>No entity chronology is available</h2><p>Add state, event, fact, or relationship metadata to build a chronology.</p></section>;

  return <section className="atlas-visual-card atlas-chronology" aria-labelledby="entity-chronology-title">
    <div className="atlas-visual-heading">
      <div><p className="eyebrow">Entity chronology</p><h2 id="entity-chronology-title">State changes, cultivation progression, events, facts, and relationships</h2></div>
      <p>This view uses only structured rows already returned by D1. State bars use validity when known; event, fact, and relationship markers use their stored chapter/reveal boundaries.</p>
    </div>
    <div className="atlas-chronology__controls">
      <CustomSelect ariaLabel="Chronology entity" value={entity.id} onChange={(value) => { setEntityId(value); setProperty("all"); }} options={entities.map((node) => ({ value: node.id, label: `${node.label} · ${activityCount.get(node.id) ?? 0} records` }))} />
      <CustomSelect ariaLabel="State property" value={property} onChange={setProperty} options={[{ value: "all", label: "All state properties" }, ...properties.map((value) => ({ value, label: value.replaceAll("_", " ") }))]} />
    </div>
    <div className="atlas-chronology__summary"><strong>{entity.label}</strong><span>{states.length} states · {events.length} events · {facts.length} facts · {edges.length} relationship records</span></div>
    <div className="atlas-chronology__scroll" tabIndex={0} aria-label={`${entity.label} chronology from chapter ${start} to ${end}`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="atlas-chronology__svg" style={{ minWidth: Math.min(width, 2200) }} role="img" aria-labelledby="chronology-svg-title chronology-svg-desc">
        <title id="chronology-svg-title">{entity.label} chronology</title>
        <desc id="chronology-svg-desc">State intervals are shown as horizontal bars. Events, facts, and relationships are chapter markers.</desc>
        <g className="chronology-grid">{ticks.map((chapter) => <g key={chapter}><line x1={x(chapter)} x2={x(chapter)} y1={30} y2={height - 34} /><text x={x(chapter)} y={20} textAnchor="middle">Ch. {chapter}</text></g>)}</g>
        <g className="chronology-states">{rows.map((row, rowIndex) => <g key={row}><text x={left - 14} y={top + rowIndex * rowGap + 5} textAnchor="end">{row.replaceAll("_", " ")}</text>{shownStates.filter((state) => state.property === row).map((state) => {
          const from = state.validFrom ?? state.visibleFrom;
          const to = state.validTo ?? end;
          const barX = x(Math.max(start, from));
          const barWidth = Math.max(8, x(Math.min(end, to)) - barX);
          return <g key={state.id} className={state.reviewed ? "is-reviewed" : "is-metadata"}><rect x={barX} y={top + rowIndex * rowGap - 13} width={barWidth} height={26} rx={3}><title>{state.value}. Reveal chapter {state.visibleFrom}{state.cycleId ? `; ${state.cycleId}` : ""}</title></rect><circle cx={x(state.visibleFrom)} cy={top + rowIndex * rowGap} r={4}><title>Revealed chapter {state.visibleFrom}</title></circle></g>;
        })}</g>)}</g>
        <g className="chronology-events"><text x={left - 14} y={eventY + 4} textAnchor="end">events</text><line x1={left} x2={right} y1={eventY} y2={eventY} />{events.map((event) => <circle key={event.id} className={event.reviewed ? "is-reviewed" : "is-metadata"} cx={x(event.chapterOrdinal)} cy={eventY} r={5}><title>{event.summary || event.label}</title></circle>)}</g>
        <g className="chronology-facts"><text x={left - 14} y={factY + 4} textAnchor="end">facts</text><line x1={left} x2={right} y1={factY} y2={factY} />{facts.map((fact) => <rect key={fact.id} className={fact.reviewed ? "is-reviewed" : "is-metadata"} x={x(fact.visibleFrom) - 4} y={factY - 4} width={8} height={8} transform={`rotate(45 ${x(fact.visibleFrom)} ${factY})`}><title>{fact.predicate.replaceAll("_", " ")}: {fact.objectValue}</title></rect>)}</g>
        <g className="chronology-relations"><text x={left - 14} y={relationY + 4} textAnchor="end">relations</text><line x1={left} x2={right} y1={relationY} y2={relationY} />{edges.map((edge) => <path key={edge.id} className={edge.reviewed ? "is-reviewed" : "is-metadata"} d={`M ${x(edge.visibleFrom)} ${relationY - 6} l 6 12 l -12 0 z`}><title>{edge.label}: {byId.get(edge.source === entity.id ? edge.target : edge.source)?.label ?? "entity"}</title></path>)}</g>
      </svg>
    </div>
    {states.some((state) => state.property === "realm") ? <div className="atlas-progression-strip"><span className="eyebrow">Cultivation progression</span>{states.filter((state) => state.property === "realm").sort((a, b) => a.visibleFrom - b.visibleFrom).map((state) => <div key={state.id}><strong>Ch. {state.visibleFrom}</strong><span>{state.value}</span></div>)}</div> : null}
    <div className="atlas-chronology__feed">{activities.map((item) => <article key={item.id} className={item.reviewed ? "is-reviewed" : "is-metadata"}><span className="atlas-chronology__chapter">Ch. {item.chapter}</span><div><small>{item.kind}</small><MetadataMarkdown source={item.title} novelId={atlas.novelId} variant="compact" className="metadata-markdown--title" />{item.detail ? <MetadataMarkdown source={item.detail} novelId={atlas.novelId} variant="compact" /> : null}{item.href ? <Link to={item.href}>Review source</Link> : null}</div></article>)}</div>
  </section>;
}
