import { useMemo } from "react";
import { Link } from "react-router";
import { ArrowLongRightIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { MetadataMarkdown } from "./MetadataMarkdown";
import type { AtlasData, AtlasEdge } from "~/lib/atlas";

function lineageKey(edge: AtlasEdge) {
  return edge.relationshipId || `${edge.source}:${edge.target}:${edge.direction || "directed"}`;
}

function stateCount(edges: AtlasEdge[]) {
  let count = 0;
  let previous = "";
  for (const edge of edges) {
    const state = `${edge.label}\u0000${edge.status || "active"}`;
    if (state !== previous) count += 1;
    previous = state;
  }
  return count;
}

export function AtlasRelationshipEvolution({ atlas, entityId }: { atlas: AtlasData; entityId: string }) {
  const nodes = useMemo(() => new Map(atlas.nodes.map((node) => [node.id, node])), [atlas.nodes]);
  const groups = useMemo(() => {
    const relevant = atlas.edges
      .filter((edge) => edge.source === entityId || edge.target === entityId)
      .sort((a, b) => (a.validFrom ?? a.visibleFrom) - (b.validFrom ?? b.visibleFrom));
    const map = new Map<string, AtlasEdge[]>();
    for (const edge of relevant) {
      const key = lineageKey(edge);
      const bucket = map.get(key) ?? [];
      bucket.push(edge);
      map.set(key, bucket);
    }
    return [...map.entries()].map(([id, snapshots]) => {
      const latest = snapshots[snapshots.length - 1];
      const otherId = latest.source === entityId ? latest.target : latest.source;
      return { id, snapshots, latest, otherId, other: nodes.get(otherId) };
    }).sort((a, b) => (a.other?.label || a.otherId).localeCompare(b.other?.label || b.otherId));
  }, [atlas.edges, entityId, nodes]);

  return <section className="atlas-relationship-evolution" aria-labelledby="relationship-evolution-title">
    <div className="atlas-relationship-evolution__heading">
      <div><p className="eyebrow">Temporal relationship ledger</p><h3 id="relationship-evolution-title">Relationship evolution, chapter by chapter</h3></div>
      <p>Every stored snapshot is kept as history. Relationships can connect any entity type—not only characters—and each entry records the relationship name plus why it has that state at that chapter.</p>
    </div>

    {!groups.length ? <div className="atlas-relationship-evolution__empty"><strong>No explicit relationship snapshots yet.</strong><span>This profile will populate as chapter metadata records relationships involving this entity.</span></div> : <div className="atlas-relationship-evolution__groups">
      {groups.map((group) => {
        const outgoing = group.latest.source === entityId;
        const bidirectional = group.latest.direction === "bidirectional";
        const states = stateCount(group.snapshots);
        return <article key={group.id} className="atlas-relationship-evolution__group">
          <header>
            <div className="atlas-relationship-evolution__counterpart">
              <span>{bidirectional ? <ArrowsRightLeftIcon aria-hidden="true" /> : <ArrowLongRightIcon className={outgoing ? "" : "is-reversed"} aria-hidden="true" />}</span>
              <div><small>{group.other?.kind || "entity"}</small><strong>{group.other?.label || group.otherId}</strong></div>
            </div>
            <div className="atlas-relationship-evolution__current"><small>Current at selected boundary</small><strong>{group.latest.label}</strong><span>{group.snapshots.length} chapter snapshot{group.snapshots.length === 1 ? "" : "s"} · {states} state{states === 1 ? "" : "s"}</span></div>
          </header>
          <ol className="atlas-relationship-timeline">
            {group.snapshots.map((edge, index) => {
              const previous = index > 0 ? group.snapshots[index - 1] : null;
              const changed = !previous || previous.label !== edge.label || previous.status !== edge.status;
              const chapter = edge.validFrom ?? edge.visibleFrom;
              return <li key={edge.id} className={changed ? "is-change" : "is-continuation"}>
                <div className="atlas-relationship-timeline__marker"><span /><small>Ch. {chapter}</small></div>
                <div className="atlas-relationship-timeline__content">
                  <div className="atlas-relationship-timeline__state"><strong>{edge.label}</strong><span>{edge.status || "active"}</span>{changed && previous ? <em>changed from {previous.label}</em> : !changed ? <em>continued</em> : null}</div>
                  {edge.evidence ? <MetadataMarkdown source={edge.evidence} novelId={atlas.novelId} variant="compact" /> : <p className="muted">No relationship explanation stored for this snapshot.</p>}
                  <div className="atlas-relationship-timeline__meta"><span>{edge.direction === "bidirectional" ? "bidirectional" : edge.source === entityId ? "outgoing" : "incoming"}</span>{edge.sourceRef.href ? <Link to={edge.sourceRef.href}>Read chapter evidence</Link> : null}</div>
                </div>
              </li>;
            })}
          </ol>
        </article>;
      })}
    </div>}
  </section>;
}
