import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsPointingOutIcon, MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
import { atlasNeighborhood, KIND_LABELS, type AtlasData, type AtlasNode } from "~/lib/atlas";

function positions(nodes: AtlasNode[], compact: boolean) {
  if (compact) {
    const points = [[300, 380], [300, 120], [495, 380], [300, 640], [105, 380]];
    return new Map(nodes.map((node, index) => [node.id, { x: points[index][0], y: points[index][1] }]));
  }
  return new Map(nodes.map((node, index) => {
    if (!index) return [node.id, { x: 600, y: 465 }];
    const ring = index <= 8 ? 0 : 1;
    const offset = ring ? index - 9 : index - 1;
    const count = ring ? Math.max(1, nodes.length - 9) : Math.min(8, nodes.length - 1);
    const angle = (offset / count) * Math.PI * 2 - Math.PI / 2 + ring * .4;
    const radius = ring ? 450 : 270;
    return [node.id, { x: 600 + Math.cos(angle) * radius, y: 465 + Math.sin(angle) * radius }];
  }));
}

export function AtlasGraph({ atlas, selectedId, onSelect }: { atlas: AtlasData; selectedId: string; onSelect: (id: string) => void }) {
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; pointer: number } | null>(null);
  const [size, setSize] = useState({ width: 760, height: 560 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const compact = size.width < 520;
  const maxNodes = compact ? 5 : 17;
  const width = compact ? 600 : 1200;
  const height = compact ? 760 : 950;
  const neighborhood = useMemo(() => atlasNeighborhood(atlas, selectedId, maxNodes), [atlas, selectedId, maxNodes]);
  const layout = useMemo(() => positions(neighborhood.nodes, compact), [neighborhood.nodes, compact]);
  const fit = Math.min(size.width / width, size.height / height);
  const scale = fit * zoom;
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setPan({ x: 0, y: 0 }); setZoom(1); }, [selectedId]);
  const changeZoom = (factor: number) => setZoom((value) => Math.min(3, Math.max(.6, value * factor)));
  return <section className="atlas-graph" aria-label="Stored Story Atlas network">
    <div className="atlas-graph-toolbar"><span>{neighborhood.nodes.length} nodes in focus</span><div>
      <button type="button" onClick={() => changeZoom(1 / 1.25)} aria-label="Zoom out"><MinusIcon aria-hidden="true" /></button>
      <button type="button" onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }} aria-label="Fit graph"><ArrowsPointingOutIcon aria-hidden="true" /></button>
      <button type="button" onClick={() => changeZoom(1.25)} aria-label="Zoom in"><PlusIcon aria-hidden="true" /></button>
    </div></div>
    <div ref={canvas} className="atlas-canvas" tabIndex={0} role="group" aria-label="Interactive graph. Arrow keys pan, plus and minus zoom, Home resets. Tab to nodes."
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "+" || event.key === "=") { event.preventDefault(); changeZoom(1.25); }
        if (event.key === "-") { event.preventDefault(); changeZoom(1 / 1.25); }
        if (event.key === "Home") { event.preventDefault(); setZoom(1); setPan({ x: 0, y: 0 }); }
        const direction: Record<string, [number, number]> = { ArrowLeft: [50, 0], ArrowRight: [-50, 0], ArrowUp: [0, 50], ArrowDown: [0, -50] };
        if (direction[event.key]) { event.preventDefault(); const [x, y] = direction[event.key]; setPan((value) => ({ x: value.x + x, y: value.y + y })); }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as Element).closest("button")) return;
        drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, pointer: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (start && start.pointer === event.pointerId) setPan({ x: start.panX + event.clientX - start.x, y: start.panY + event.clientY - start.y });
      }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className={`atlas-world${compact ? " atlas-world--compact" : ""}`} style={{ width, height, transform: `translate(${(size.width - width * scale) / 2 + pan.x}px, ${(size.height - height * scale) / 2 + pan.y}px) scale(${scale})` }}>
        <svg width={width} height={height} className="atlas-edges" aria-hidden="true">
          {neighborhood.edges.map((edge) => {
            const a = layout.get(edge.source); const b = layout.get(edge.target);
            return a && b ? <line className={edge.reviewed ? "is-reviewed" : "is-metadata"} key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null;
          })}
        </svg>
        {neighborhood.nodes.map((node, index) => { const pos = layout.get(node.id)!; return <button type="button" key={node.id}
          className={`atlas-node atlas-node--${node.kind}${node.reviewed ? " is-reviewed" : " is-metadata"}${!index ? " is-selected" : ""}`} style={{ left: pos.x, top: pos.y }}
          title={node.label} aria-label={`${node.label}, ${KIND_LABELS[node.kind]}, ${node.reviewed ? "reviewed" : "metadata-derived"}. Focus connections.`} aria-pressed={!index}
          onClick={() => onSelect(node.id)}><small>{KIND_LABELS[node.kind]} · {node.reviewed ? "reviewed" : "metadata"}</small><strong>{node.label}</strong></button>; })}
      </div>
    </div>
    <p className="atlas-graph-caption">Solid lines are reviewed relationships. Dashed lines are unreviewed or imported relationship metadata; interpret them only according to their stored label.{neighborhood.contextual ? " This focus has no stored edge in the selected window, so nearby reveal-context nodes are shown without connecting lines." : ""}</p>
    {neighborhood.omitted ? <p className="atlas-limit" role="status">{neighborhood.omitted} more context nodes are available. The canvas shows at most {maxNodes} nodes at this width to stay readable.</p> : null}
  </section>;
}
