import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { atlasActiveEdgesInWindow, type AtlasData, type AtlasEdge, type AtlasNode } from "~/lib/atlas";
import { MetadataMarkdown } from "./MetadataMarkdown";

function pairKey(source: string, target: string) {
  return `${source}\u0000${target}`;
}

function relationSummary(edges: AtlasEdge[]) {
  return [...new Set(edges.map((edge) => edge.label || edge.relation))].join(", ");
}

export function AtlasRelationshipMatrix({ atlas }: { atlas: AtlasData }) {
  const byId = useMemo(() => new Map(atlas.nodes.map((node) => [node.id, node])), [atlas.nodes]);
  const relations = useMemo(() => atlasActiveEdgesInWindow(atlas).filter((edge) => byId.get(edge.source)?.kind === "character" && byId.get(edge.target)?.kind === "character"), [atlas, byId]);
  const ranked = useMemo(() => {
    const score = new Map<string, number>();
    for (const edge of relations) {
      score.set(edge.source, (score.get(edge.source) ?? 0) + 1);
      score.set(edge.target, (score.get(edge.target) ?? 0) + 1);
    }
    return atlas.nodes.filter((node) => node.kind === "character" && score.has(node.id))
      .sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || a.label.localeCompare(b.label))
      .slice(0, 16);
  }, [atlas.nodes, relations]);
  const pairMap = useMemo(() => {
    const map = new Map<string, AtlasEdge[]>();
    for (const edge of relations) {
      const key = pairKey(edge.source, edge.target);
      const rows = map.get(key) ?? [];
      rows.push(edge);
      map.set(key, rows);
    }
    return map;
  }, [relations]);
  const [selectedKey, setSelectedKey] = useState(() => pairMap.keys().next().value ?? "");
  useEffect(() => {
    if (!pairMap.has(selectedKey)) setSelectedKey(pairMap.keys().next().value ?? "");
  }, [pairMap, selectedKey]);
  const selected = pairMap.get(selectedKey) ?? [];
  const selectedSource = selected.length ? byId.get(selected[0].source) : undefined;
  const selectedTarget = selected.length ? byId.get(selected[0].target) : undefined;

  if (!relations.length || ranked.length < 2) {
    return <section className="atlas-visual-card empty-state"><h2>Relationship matrix needs more explicit character edges</h2><p>The matrix only uses stored character-to-character relationships. It never turns co-occurrence into a relationship.</p></section>;
  }

  return <section className="atlas-visual-card atlas-matrix" aria-labelledby="relationship-matrix-title">
    <div className="atlas-visual-heading">
      <div><p className="eyebrow">Relationship matrix</p><h2 id="relationship-matrix-title">Explicit character relationships without edge crossings</h2></div>
      <p>{relations.length} stored relationship row(s) are active inside this window. Rows are sources; columns are targets. The view is capped at the 16 most connected characters for readability.</p>
    </div>
    <div className="atlas-matrix__scroll" tabIndex={0} aria-label="Character relationship matrix">
      <table>
        <thead><tr><th scope="col" className="atlas-matrix__corner">Source / target</th>{ranked.map((node) => <th scope="col" key={node.id}><span title={node.label}>{node.label}</span></th>)}</tr></thead>
        <tbody>{ranked.map((source) => <tr key={source.id}><th scope="row"><span title={source.label}>{source.label}</span></th>{ranked.map((target) => {
          if (source.id === target.id) return <td key={target.id} className="is-self" aria-label={`${source.label} to itself`} />;
          const edges = pairMap.get(pairKey(source.id, target.id)) ?? [];
          if (!edges.length) return <td key={target.id} className="is-empty" />;
          const reviewed = edges.every((edge) => edge.reviewed);
          const label = `${source.label} to ${target.label}: ${relationSummary(edges)}${edges.length > 1 ? `, ${edges.length} records` : ""}`;
          return <td key={target.id}><button type="button" className={reviewed ? "is-reviewed" : "is-metadata"} aria-pressed={selectedKey === pairKey(source.id, target.id)} aria-label={label} title={label} onClick={() => setSelectedKey(pairKey(source.id, target.id))}>{edges.length > 1 ? edges.length : ""}<span className="sr-only">{relationSummary(edges)}</span></button></td>;
        })}</tr>)}</tbody>
      </table>
    </div>
    <div className="atlas-matrix__legend"><span><i className="is-reviewed" /> Reviewed</span><span><i className="is-metadata" /> Unreviewed metadata</span><span>Empty cell = no stored directed relationship</span></div>
    {selected.length ? <div className="atlas-matrix__detail">
      <div><p className="eyebrow">Selected relationship</p><h3>{selectedSource?.label ?? selected[0].source} / {selectedTarget?.label ?? selected[0].target}</h3></div>
      <div className="atlas-matrix__relations">{selected.map((edge) => <article key={edge.id}>
        <strong>{edge.label || edge.relation}</strong>
        <span>Reveal Ch. {edge.visibleFrom}{edge.validFrom != null ? ` · valid from Ch. ${edge.validFrom}` : ""}{edge.validTo != null ? `–${edge.validTo}` : ""}{edge.cycleId ? ` · ${edge.cycleId}` : ""}</span>
        <span>{edge.certainty || edge.status || (edge.reviewed ? "reviewed" : "metadata")}</span>
        {edge.evidence ? <MetadataMarkdown source={edge.evidence} novelId={atlas.novelId} variant="compact" className="metadata-markdown--evidence" /> : null}
        {edge.sourceRef.href ? <Link to={edge.sourceRef.href}>Review source</Link> : null}
      </article>)}</div>
    </div> : null}
  </section>;
}
