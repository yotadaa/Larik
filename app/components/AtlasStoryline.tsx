import { Link } from "react-router";
import { atlasEdgesInWindow, type AtlasData, type AtlasNode } from "~/lib/atlas";

function evenlySample<T>(items: T[], max: number) {
  if (items.length <= max) return items;
  if (max <= 1) return items.slice(0, 1);
  const picked: T[] = [];
  const used = new Set<number>();
  for (let i = 0; i < max; i++) {
    const index = Math.round((i * (items.length - 1)) / (max - 1));
    if (!used.has(index)) { used.add(index); picked.push(items[index]); }
  }
  return picked;
}

export function AtlasStoryline({ atlas }: { atlas: AtlasData }) {
  const start = atlas.scope === "through" ? 1 : atlas.from.ordinal;
  const end = atlas.through.ordinal;
  const allCharacters = atlas.nodes.filter((node) => node.kind === "character").sort((a, b) => a.visibleFrom - b.visibleFrom || a.label.localeCompare(b.label));
  const inWindow = allCharacters.filter((node) => node.visibleFrom >= start && node.visibleFrom <= end);
  const earlierContext = allCharacters.filter((node) => node.visibleFrom < start);
  let characters: AtlasNode[];
  if (atlas.scope === "all") characters = evenlySample(allCharacters, 16);
  else if (inWindow.length) characters = [...evenlySample(inWindow, 12), ...earlierContext.slice(-4)].slice(0, 16);
  else characters = earlierContext.slice(-12);
  characters = [...new Map(characters.map((node) => [node.id, node])).values()].sort((a, b) => a.visibleFrom - b.visibleFrom || a.label.localeCompare(b.label));

  const ids = new Set(characters.map((node) => node.id));
  const relations = atlasEdgesInWindow(atlas).filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  const rowById = new Map(characters.map((node, index) => [node.id, index]));
  const left = 190;
  const rangeLength = Math.max(1, end - start + 1);
  const width = Math.min(2400, Math.max(940, 260 + rangeLength * 18));
  const right = width - 60;
  const top = 58;
  const rowGap = 58;
  const bottom = top + Math.max(1, characters.length - 1) * rowGap + 86;
  const height = bottom + 46;
  const x = (ordinal: number) => left + ((Math.min(end, Math.max(start, ordinal)) - start) / Math.max(1, end - start)) * (right - left);
  const y = (index: number) => top + index * rowGap;
  const tickStep = rangeLength <= 12 ? 1 : rangeLength <= 35 ? 5 : rangeLength <= 80 ? 10 : 20;
  const ticks = Array.from({ length: Math.ceil(rangeLength / tickStep) }, (_, index) => start + index * tickStep).filter((value) => value <= end);
  if (!ticks.includes(end)) ticks.push(end);

  if (!characters.length) return <section className="atlas-storyline empty-state"><h2>No character metadata in this window</h2><p>Try a wider range or open Events for chapter recap coverage.</p></section>;

  return <section className="atlas-storyline" aria-labelledby="storyline-title">
    <div className="atlas-storyline__heading">
      <div><p className="eyebrow">Temporal story view</p><h2 id="storyline-title">Character reveals, stored connections, and chapter events</h2></div>
      <p>Window: chapters {start}–{end}. Solid relationship markers are reviewed; dashed markers are metadata links. Recap-derived events remain explicitly unreviewed.</p>
    </div>
    <div className="atlas-storyline__scroll" tabIndex={0} aria-label={`Storyline from chapter ${start} through chapter ${end}`}>
      <svg className="atlas-storyline__svg" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: Math.min(width, 2200) }} role="img" aria-labelledby="storyline-svg-title storyline-svg-desc">
        <title id="storyline-svg-title">Storyline from chapter {start} through chapter {end}</title>
        <desc id="storyline-svg-desc">Character lanes show when indexed characters are visible. Relationship markers and recap events are limited to the selected chapter window.</desc>
        <g className="storyline-grid">
          {ticks.map((chapter) => <g key={chapter}>
            <line x1={x(chapter)} x2={x(chapter)} y1={26} y2={bottom - 18} />
            <text x={x(chapter)} y={19} textAnchor="middle">Ch. {chapter}</text>
          </g>)}
        </g>
        <g className="storyline-lanes">
          {characters.map((node, index) => {
            const laneStart = Math.max(start, node.visibleFrom);
            return <g key={node.id} className={node.reviewed ? "is-reviewed" : "is-metadata"}>
              <text x={left - 16} y={y(index) + 5} textAnchor="end">{node.label}</text>
              <line className="storyline-lane" x1={x(laneStart)} x2={right} y1={y(index)} y2={y(index)} />
              {node.visibleFrom >= start ? <circle className="storyline-entry" cx={x(node.visibleFrom)} cy={y(index)} r="6"><title>{node.label} is first indexed at chapter {node.visibleFrom} ({node.reviewed ? "reviewed" : "metadata-derived"})</title></circle> : <circle className="storyline-context-dot" cx={x(start)} cy={y(index)} r="4"><title>{node.label} was already present before this range; first indexed at chapter {node.visibleFrom}</title></circle>}
            </g>;
          })}
        </g>
        <g className="storyline-relations">
          {relations.map((edge) => {
            const a = rowById.get(edge.source); const b = rowById.get(edge.target);
            if (a == null || b == null) return null;
            const relationX = x(edge.visibleFrom);
            return <g key={edge.id} className={edge.reviewed ? "is-reviewed" : "is-metadata"}>
              <line className="storyline-relationship" x1={relationX} x2={relationX} y1={y(Math.min(a, b))} y2={y(Math.max(a, b))} />
              <circle className="storyline-relation-dot" cx={relationX} cy={(y(a) + y(b)) / 2} r="5"><title>{edge.label}: chapter {edge.visibleFrom}. {edge.evidence}</title></circle>
            </g>;
          })}
        </g>
        <g className="storyline-events">
          <line x1={left} x2={right} y1={bottom - 18} y2={bottom - 18} />
          <text x={left - 16} y={bottom - 13} textAnchor="end">Events</text>
          {atlas.events.map((event) => <circle key={event.id} className={event.reviewed ? "is-reviewed" : "is-metadata"} cx={x(event.chapterOrdinal)} cy={bottom - 18} r={event.reviewed ? 6 : 4}><title>{event.label}: {event.reviewed ? "reviewed event" : "recap metadata"}</title></circle>)}
        </g>
      </svg>
    </div>
    <div className="atlas-storyline__sources">
      {atlas.events.slice(0, 24).map((event) => <Link key={event.id} to={event.source.href}><strong>Ch. {event.chapterOrdinal} · {event.reviewed ? "reviewed" : "recap"}</strong><span>{event.label}</span></Link>)}
      {atlas.events.length > 24 ? <div className="atlas-storyline__more">+ {atlas.events.length - 24} more event sources are available in the Events view.</div> : null}
    </div>
  </section>;
}
