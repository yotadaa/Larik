import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CustomSelect } from "./CustomSelect";
import { atlasWindowBounds, type AtlasData } from "~/lib/atlas";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function AtlasArcNavigator({ atlas }: { atlas: AtlasData }) {
  const { start, end } = atlasWindowBounds(atlas);
  const arcs = useMemo(() => atlas.arcs.filter((arc) => arc.startChapter <= end && (arc.endChapter ?? end) >= start), [atlas.arcs, end, start]);
  const cycles = useMemo(() => atlas.cycles.filter((cycle) => cycle.startChapter <= end && (cycle.endChapter ?? end) >= start), [atlas.cycles, end, start]);
  const [selectedArcId, setSelectedArcId] = useState(() => arcs[0]?.id ?? "");
  const selectedArc = arcs.find((arc) => arc.id === selectedArcId) ?? arcs[0];
  const byId = useMemo(() => new Map(atlas.nodes.map((node) => [node.id, node])), [atlas.nodes]);
  const width = Math.min(2800, Math.max(960, 320 + (end - start + 1) * 14));
  const left = 130;
  const right = width - 50;
  const cycleY = 70;
  const arcY = 150;
  const eventY = 225;
  const height = 285;
  const x = (chapter: number) => left + ((clamp(chapter, start, end) - start) / Math.max(1, end - start)) * (right - left);
  const tickStep = end - start <= 15 ? 1 : end - start <= 50 ? 5 : end - start <= 100 ? 10 : 20;
  const ticks = Array.from({ length: Math.ceil((end - start + 1) / tickStep) }, (_, index) => start + index * tickStep).filter((value) => value <= end);
  if (!ticks.includes(end)) ticks.push(end);

  if (!arcs.length && !cycles.length) {
    return <section className="atlas-visual-card empty-state"><h2>No arc or regression-cycle metadata in this window</h2><p>The navigator only renders explicit ranges from arcs.md and cycles.md.</p></section>;
  }

  return <section className="atlas-visual-card atlas-arc-map" aria-labelledby="arc-map-title">
    <div className="atlas-visual-heading">
      <div><p className="eyebrow">Arc + regression navigator</p><h2 id="arc-map-title">Publication chapters separated from regression-cycle context</h2></div>
      <p>Cycle and arc spans come from structured metadata. The axis is publication chapter order; world-time labels remain separate because regression chronology is not assumed to equal chapter order.</p>
    </div>
    <div className="atlas-arc-map__scroll" tabIndex={0} aria-label={`Arcs and cycles from chapter ${start} to ${end}`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="atlas-arc-map__svg" style={{ minWidth: Math.min(width, 2200) }} role="img" aria-labelledby="arc-map-svg-title arc-map-svg-desc">
        <title id="arc-map-svg-title">Story arcs and regression cycles</title>
        <desc id="arc-map-svg-desc">Regression cycles and story arcs are shown as horizontal spans over publication chapter numbers.</desc>
        <g className="arc-map-grid">{ticks.map((chapter) => <g key={chapter}><line x1={x(chapter)} x2={x(chapter)} y1={32} y2={eventY + 22} /><text x={x(chapter)} y={22} textAnchor="middle">Ch. {chapter}</text></g>)}</g>
        <text className="arc-map-label" x={left - 14} y={cycleY + 5} textAnchor="end">Cycles</text>
        <g className="arc-map-cycles">{cycles.map((cycle) => {
          const from = Math.max(start, cycle.startChapter);
          const to = Math.min(end, cycle.endChapter ?? end);
          return <g key={cycle.id} className={cycle.reviewed ? "is-reviewed" : "is-metadata"}><rect x={x(from)} y={cycleY - 16} width={Math.max(8, x(to) - x(from))} height={32} rx={4}><title>{cycle.id}: chapters {cycle.startChapter}–{cycle.endChapter ?? "ongoing"}; {cycle.status}</title></rect><text x={x(from) + 8} y={cycleY + 4}>{cycle.number != null ? `Cycle ${cycle.number}` : cycle.id}</text></g>;
        })}</g>
        <text className="arc-map-label" x={left - 14} y={arcY + 5} textAnchor="end">Arcs</text>
        <g className="arc-map-arcs">{arcs.map((arc) => {
          const from = Math.max(start, arc.startChapter);
          const to = Math.min(end, arc.endChapter ?? end);
          const isSelected = selectedArc?.id === arc.id;
          return <g key={arc.id} className={`${arc.reviewed ? "is-reviewed" : "is-metadata"}${isSelected ? " is-selected" : ""}`}><rect x={x(from)} y={arcY - 14} width={Math.max(8, x(to) - x(from))} height={28} rx={3}><title>{arc.title}: chapters {arc.startChapter}–{arc.endChapter ?? "ongoing"}</title></rect></g>;
        })}</g>
        <text className="arc-map-label" x={left - 14} y={eventY + 4} textAnchor="end">Events</text>
        <line className="arc-map-event-line" x1={left} x2={right} y1={eventY} y2={eventY} />
        {atlas.events.map((event) => <circle key={event.id} className={event.reviewed ? "is-reviewed" : "is-metadata"} cx={x(event.chapterOrdinal)} cy={eventY} r={4}><title>{event.summary || event.label}</title></circle>)}
      </svg>
    </div>
    {arcs.length ? <div className="atlas-arc-map__inspector">
      <CustomSelect ariaLabel="Story arc" value={selectedArc?.id ?? ""} onChange={setSelectedArcId} options={arcs.map((arc) => ({ value: arc.id, label: `${arc.title} · Ch. ${arc.startChapter}–${arc.endChapter ?? "…"}` }))} />
      {selectedArc ? <article>
        <div><p className="eyebrow">{selectedArc.status || "Story arc"}</p><h3>{selectedArc.title}</h3><p>{selectedArc.summary}</p></div>
        <dl><div><dt>Range</dt><dd>Ch. {selectedArc.startChapter}–{selectedArc.endChapter ?? "ongoing"}</dd></div><div><dt>Cycles</dt><dd>{selectedArc.cycleIds.join(", ") || "Not specified"}</dd></div><div><dt>Key entities</dt><dd>{selectedArc.keyEntityIds.map((id) => byId.get(id)?.label ?? id).join(", ") || "Not listed"}</dd></div></dl>
        {selectedArc.evidence ? <blockquote>{selectedArc.evidence}</blockquote> : null}
        {selectedArc.source.href ? <Link to={selectedArc.source.href}>Review arc source</Link> : null}
      </article> : null}
    </div> : null}
    {cycles.length ? <div className="atlas-cycle-cards">{cycles.map((cycle) => <article key={cycle.id} className={cycle.reviewed ? "is-reviewed" : "is-metadata"}><strong>{cycle.number != null ? `Cycle ${cycle.number}` : cycle.id}</strong><span>Ch. {cycle.startChapter}–{cycle.endChapter ?? "ongoing"}</span><small>{cycle.resetTrigger ? `Reset: ${cycle.resetTrigger}` : cycle.status}</small>{cycle.worldEndMarker ? <p>{cycle.worldEndMarker}</p> : null}{cycle.source.href ? <Link to={cycle.source.href}>Source</Link> : null}</article>)}</div> : null}
  </section>;
}
