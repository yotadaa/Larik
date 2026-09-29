import { Link } from "react-router";
import { atlasActiveEdgesInWindow, atlasWindowBounds, type AtlasData, type AtlasNode } from "~/lib/atlas";
import { MetadataMarkdown } from "./MetadataMarkdown";

function rankedCharacters(atlas: AtlasData, max: number) {
  const { start, end } = atlasWindowBounds(atlas);
  const score = new Map<string, number>();
  const touch = (id: string, amount: number) => score.set(id, (score.get(id) ?? 0) + amount);
  for (const edge of atlasActiveEdgesInWindow(atlas)) { touch(edge.source, 4); touch(edge.target, 4); }
  for (const event of atlas.events) for (const id of event.entityIds) touch(id, 2);
  for (const scene of atlas.scenes) for (const id of scene.participantIds) touch(id, 1);
  for (const arc of atlas.arcs) for (const id of arc.keyEntityIds) touch(id, 2);
  for (const node of atlas.nodes) if (node.kind === "character" && node.visibleFrom >= start && node.visibleFrom <= end) touch(node.id, 1);
  const characters = atlas.nodes.filter((node) => node.kind === "character" && (score.has(node.id) || (node.visibleFrom >= start && node.visibleFrom <= end)));
  return characters.sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || a.visibleFrom - b.visibleFrom || a.label.localeCompare(b.label)).slice(0, max);
}

export function AtlasStoryline({ atlas }: { atlas: AtlasData }) {
  const { start, end } = atlasWindowBounds(atlas);
  const characters = rankedCharacters(atlas, 18);
  const ids = new Set(characters.map((node) => node.id));
  const relations = atlasActiveEdgesInWindow(atlas).filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  const rowById = new Map(characters.map((node, index) => [node.id, index]));
  const left = 190;
  const rangeLength = Math.max(1, end - start + 1);
  const width = Math.min(2800, Math.max(980, 300 + rangeLength * 18));
  const right = width - 60;
  const cycleY = 56;
  const top = 112;
  const rowGap = 58;
  const eventY = top + Math.max(1, characters.length - 1) * rowGap + 76;
  const height = eventY + 76;
  const x = (ordinal: number) => left + ((Math.min(end, Math.max(start, ordinal)) - start) / Math.max(1, end - start)) * (right - left);
  const y = (index: number) => top + index * rowGap;
  const tickStep = rangeLength <= 12 ? 1 : rangeLength <= 35 ? 5 : rangeLength <= 80 ? 10 : 20;
  const ticks = Array.from({ length: Math.ceil(rangeLength / tickStep) }, (_, index) => start + index * tickStep).filter((value) => value <= end);
  if (!ticks.includes(end)) ticks.push(end);
  const cycles = atlas.cycles.filter((cycle) => cycle.startChapter <= end && (cycle.endChapter ?? end) >= start);

  if (!characters.length) return <section className="atlas-storyline empty-state"><h2>No character metadata in this window</h2><p>Try a wider range or open Evidence for structured source coverage.</p></section>;

  return <section className="atlas-storyline" aria-labelledby="storyline-title">
    <div className="atlas-storyline__heading">
      <div><p className="eyebrow">Temporal storyline</p><h2 id="storyline-title">Character lanes across regression cycles</h2></div>
      <p>The most active characters are ranked from explicit relationships, events, scenes, and arc membership. Existing relationships can enter as context at the left edge; future relationships are never serialized.</p>
    </div>
    <div className="atlas-storyline__scroll" tabIndex={0} aria-label={`Storyline from chapter ${start} through chapter ${end}`}>
      <svg className="atlas-storyline__svg" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: Math.min(width, 2300) }} role="img" aria-labelledby="storyline-svg-title storyline-svg-desc">
        <title id="storyline-svg-title">Storyline from chapter {start} through chapter {end}</title>
        <desc id="storyline-svg-desc">Regression cycle spans appear above character lanes. Character lanes, relationship markers, and stored events are limited to the selected spoiler boundary.</desc>
        <g className="storyline-grid">{ticks.map((chapter) => <g key={chapter}><line x1={x(chapter)} x2={x(chapter)} y1={24} y2={eventY + 20} /><text x={x(chapter)} y={18} textAnchor="middle">Ch. {chapter}</text></g>)}</g>
        <g className="storyline-cycles"><text x={left - 16} y={cycleY + 4} textAnchor="end">Cycles</text>{cycles.map((cycle) => {
          const from = Math.max(start, cycle.startChapter);
          const to = Math.min(end, cycle.endChapter ?? end);
          return <g key={cycle.id} className={cycle.reviewed ? "is-reviewed" : "is-metadata"}><rect x={x(from)} y={cycleY - 14} width={Math.max(8, x(to) - x(from))} height={28} rx={3}><title>{cycle.id}: Ch. {cycle.startChapter}–{cycle.endChapter ?? "ongoing"}</title></rect><text x={x(from) + 7} y={cycleY + 4}>{cycle.number != null ? `C${cycle.number}` : cycle.id}</text></g>;
        })}</g>
        <g className="storyline-lanes">{characters.map((node: AtlasNode, index) => {
          const laneStart = Math.max(start, node.visibleFrom);
          return <g key={node.id} className={node.reviewed ? "is-reviewed" : "is-metadata"}><text x={left - 16} y={y(index) + 5} textAnchor="end">{node.label}</text><line className="storyline-lane" x1={x(laneStart)} x2={right} y1={y(index)} y2={y(index)} />{node.visibleFrom >= start ? <circle className="storyline-entry" cx={x(node.visibleFrom)} cy={y(index)} r="6"><title>{node.label} first revealed/indexed at chapter {node.visibleFrom}</title></circle> : <circle className="storyline-context-dot" cx={x(start)} cy={y(index)} r="4"><title>{node.label} is prior context; first indexed at chapter {node.visibleFrom}</title></circle>}</g>;
        })}</g>
        <g className="storyline-relations">{relations.map((edge) => {
          const a = rowById.get(edge.source); const b = rowById.get(edge.target);
          if (a == null || b == null) return null;
          const contextual = edge.visibleFrom < start;
          const relationX = x(Math.max(start, edge.visibleFrom));
          return <g key={edge.id} className={`${edge.reviewed ? "is-reviewed" : "is-metadata"}${contextual ? " is-context" : ""}`}><line className="storyline-relationship" x1={relationX} x2={relationX} y1={y(Math.min(a, b))} y2={y(Math.max(a, b))} /><circle className="storyline-relation-dot" cx={relationX} cy={(y(a) + y(b)) / 2} r="5"><title>{edge.label}: revealed Ch. {edge.visibleFrom}{edge.validFrom != null ? `; valid from Ch. ${edge.validFrom}` : ""}{edge.validTo != null ? ` to Ch. ${edge.validTo}` : ""}. {edge.evidence}</title></circle></g>;
        })}</g>
        <g className="storyline-events"><line x1={left} x2={right} y1={eventY} y2={eventY} /><text x={left - 16} y={eventY + 4} textAnchor="end">Events</text>{atlas.events.map((event) => <circle key={event.id} className={event.reviewed ? "is-reviewed" : "is-metadata"} cx={x(event.chapterOrdinal)} cy={eventY} r={event.reviewed ? 6 : 4}><title>{event.summary || event.label}: {event.reviewed ? "reviewed event" : "unreviewed metadata"}</title></circle>)}</g>
      </svg>
    </div>
    <div className="atlas-storyline__legend"><span><i className="is-reviewed" />Reviewed knowledge</span><span><i className="is-metadata" />Unreviewed metadata</span><span><i className="is-context" />Relationship known before range</span></div>
    <div className="atlas-storyline__sources">{atlas.events.slice(0, 24).map((event) => <Link key={event.id} to={event.source.href}><strong>Ch. {event.chapterOrdinal} · {event.reviewed ? "reviewed" : "unreviewed"}</strong><MetadataMarkdown source={event.summary || event.label} novelId={atlas.novelId} variant="inline" /></Link>)}{atlas.events.length > 24 ? <div className="atlas-storyline__more">+ {atlas.events.length - 24} more event sources are available in Evidence.</div> : null}</div>
  </section>;
}
