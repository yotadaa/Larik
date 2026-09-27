export type AtlasKind = "character" | "location" | "term" | "organization" | "item";
export type AtlasScope = "through" | "range" | "all";
export interface AtlasSource {
  chapterId: string;
  href: string;
  label: string;
}
export interface AtlasNode {
  id: string;
  label: string;
  kind: AtlasKind;
  description: string;
  aliases: string[];
  visibleFrom: number;
  source: AtlasSource;
  /** True for manually reviewed facts; false for metadata-derived reference entries. */
  reviewed: boolean;
}
export interface AtlasEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  label: string;
  evidence: string;
  visibleFrom: number;
  sourceRef: AtlasSource;
  /** True for manually reviewed story relationships; false for structural metadata links. */
  reviewed: boolean;
}
export interface AtlasEvent {
  id: string;
  chapterOrdinal: number;
  chapterId: string;
  kind: string;
  label: string;
  summary: string;
  entityIds: string[];
  source: AtlasSource;
  /** True for manually reviewed events; false for recap-derived chapter summaries. */
  reviewed: boolean;
}
export interface AtlasChapterBoundary {
  chapterId: string;
  ordinal: number;
  title: string;
  /** True only when this exact chapter has been manually reviewed for the knowledge model. */
  reviewed?: boolean;
}
export interface AtlasData {
  novelId: string;
  version: number;
  coverageNote: string;
  scope: AtlasScope;
  /** First chapter included by the requested visualization window. */
  from: AtlasChapterBoundary;
  /** Last chapter included by the requested visualization window. */
  through: AtlasChapterBoundary;
  /** Latest manually reviewed chapter at or before the requested end boundary. */
  reviewedThrough: AtlasChapterBoundary;
  /** True when the requested window extends beyond manually reviewed facts. */
  coverageLimited: boolean;
  /** True only after the reader explicitly unlocks metadata-derived spoiler content. */
  unreviewedUnlocked: boolean;
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  events: AtlasEvent[];
}

export const KIND_LABELS: Record<AtlasKind, string> = {
  character: "Characters",
  location: "Places",
  term: "Terms",
  organization: "Groups",
  item: "Items",
};

export function atlasFactsInWindow(atlas: AtlasData) {
  if (atlas.scope === "through") return atlas.nodes;
  return atlas.nodes.filter((node) => node.visibleFrom >= atlas.from.ordinal && node.visibleFrom <= atlas.through.ordinal);
}

export function atlasEdgesInWindow(atlas: AtlasData) {
  if (atlas.scope === "through") return atlas.edges;
  return atlas.edges.filter((edge) => edge.visibleFrom >= atlas.from.ordinal && edge.visibleFrom <= atlas.through.ordinal);
}

export function atlasNeighborhood(atlas: AtlasData, id: string, maxNodes = 25) {
  const selected = atlas.nodes.find((node) => node.id === id);
  if (!selected) return { nodes: [] as AtlasNode[], edges: [] as AtlasEdge[], omitted: 0, contextual: false };
  const windowEdges = atlasEdgesInWindow(atlas);
  const connected = new Set<string>();
  for (const edge of windowEdges) {
    if (edge.source === id) connected.add(edge.target);
    if (edge.target === id) connected.add(edge.source);
  }
  let contextual = false;
  let neighbors = atlas.nodes.filter((node) => connected.has(node.id))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));

  // Metadata-derived ranges can legitimately contain entities without a semantic relationship.
  // Keep the Network useful by showing nearby reveal-context nodes without drawing fake edges.
  if (!neighbors.length) {
    contextual = true;
    neighbors = atlasFactsInWindow(atlas)
      .filter((node) => node.id !== id)
      .sort((a, b) => Math.abs(a.visibleFrom - selected.visibleFrom) - Math.abs(b.visibleFrom - selected.visibleFrom) || a.label.localeCompare(b.label));
  }

  const nodes = [selected, ...neighbors.slice(0, Math.max(0, maxNodes - 1))];
  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: windowEdges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    omitted: Math.max(0, neighbors.length - nodes.length + 1),
    contextual,
  };
}

export interface InlineLookupData {
  version: number;
  through: AtlasChapterBoundary;
  reviewedThrough: AtlasChapterBoundary;
  coverageLimited: boolean;
  coverageNote: string;
  entries: AtlasNode[];
}
