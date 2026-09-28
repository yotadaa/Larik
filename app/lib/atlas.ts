export type AtlasKind =
  | "character" | "location" | "term" | "organization" | "item"
  | "technique" | "realm" | "concept" | "species" | "faction"
  | "institution" | "title" | "system" | "aspect" | "cycle" | "other";
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
  entityType?: string;
  description: string;
  aliases: string[];
  visibleFrom: number;
  status?: string;
  source: AtlasSource;
  /** True for metadata whose reveal chapter is inside a reviewed chapter boundary. */
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
  validFrom?: number | null;
  validTo?: number | null;
  status?: string;
  certainty?: string;
  sourceRef: AtlasSource;
  reviewed: boolean;
}
export interface AtlasFact {
  id: string;
  subjectId: string;
  predicate: string;
  objectValue: string;
  valueType: string;
  visibleFrom: number;
  validFrom?: number | null;
  validTo?: number | null;
  epistemicStatus: string;
  sourceType: string;
  sourceEntityId: string;
  evidence: string;
  source: AtlasSource;
  reviewed: boolean;
}
export interface AtlasState {
  id: string;
  entityId: string;
  property: string;
  value: string;
  valueType: string;
  visibleFrom: number;
  validFrom?: number | null;
  validTo?: number | null;
  cycleId: string;
  certainty: string;
  evidence: string;
  source: AtlasSource;
  reviewed: boolean;
}
export interface AtlasEvent {
  id: string;
  chapterOrdinal: number;
  chapterId: string;
  sceneId?: string;
  sceneOrder?: number | null;
  cycleId?: string;
  kind: string;
  label: string;
  summary: string;
  entityIds: string[];
  source: AtlasSource;
  reviewed: boolean;
}
export interface AtlasScene {
  id: string;
  chapterOrdinal: number;
  sceneOrder?: number | null;
  cycleId: string;
  locationIds: string[];
  timeMarker: string;
  povEntityId: string;
  participantIds: string[];
  eventIds: string[];
  summary: string;
  source: AtlasSource;
  reviewed: boolean;
}
export interface AtlasArc {
  id: string;
  title: string;
  parentArcId: string;
  startChapter: number;
  endChapter: number | null;
  visibleFrom: number;
  cycleIds: string[];
  status: string;
  summary: string;
  keyEntityIds: string[];
  keyEventIds: string[];
  source: AtlasSource;
  reviewed: boolean;
}
export interface AtlasCycle {
  id: string;
  number: number | null;
  startChapter: number;
  endChapter: number | null;
  visibleFrom: number;
  worldStartMarker: string;
  worldEndMarker: string;
  resetTrigger: string;
  status: string;
  source: AtlasSource;
  reviewed: boolean;
}
export interface AtlasChapterBoundary {
  chapterId: string;
  ordinal: number;
  title: string;
  reviewed?: boolean;
}
export interface AtlasData {
  novelId: string;
  version: number;
  coverageNote: string;
  scope: AtlasScope;
  from: AtlasChapterBoundary;
  through: AtlasChapterBoundary;
  reviewedThrough: AtlasChapterBoundary;
  coverageLimited: boolean;
  unreviewedUnlocked: boolean;
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  facts: AtlasFact[];
  states: AtlasState[];
  events: AtlasEvent[];
  scenes: AtlasScene[];
  arcs: AtlasArc[];
  cycles: AtlasCycle[];
  integrityIssueCount: number;
}

export const KIND_LABELS: Record<AtlasKind, string> = {
  character: "Characters",
  location: "Places",
  term: "Terms",
  organization: "Groups",
  item: "Items",
  technique: "Techniques",
  realm: "Realms",
  concept: "Concepts",
  species: "Species",
  faction: "Factions",
  institution: "Institutions",
  title: "Titles",
  system: "Systems",
  aspect: "Aspects",
  cycle: "Cycles",
  other: "Other",
};

export function atlasKindFromMetadata(value: string): AtlasKind {
  const kind = value.trim().toLowerCase().replaceAll(" ", "_");
  if (kind === "character") return "character";
  if (kind === "location") return "location";
  if (kind === "organization" || kind === "group" || kind === "sect") return "organization";
  if (kind === "item" || kind === "artifact") return "item";
  if (kind === "technique" || kind === "skill" || kind === "method") return "technique";
  if (kind === "realm") return "realm";
  if (kind === "concept") return "concept";
  if (kind === "species") return "species";
  if (kind === "faction") return "faction";
  if (kind === "institution") return "institution";
  if (kind === "title") return "title";
  if (kind === "system") return "system";
  if (kind === "aspect") return "aspect";
  if (kind === "cycle") return "cycle";
  if (kind.includes("term")) return "term";
  return "other";
}

/** Historical name kept for compatibility: these are entity/node rows, not atomic metadata_facts rows. */
export function atlasFactsInWindow(atlas: AtlasData) {
  if (atlas.scope === "through") return atlas.nodes;
  return atlas.nodes.filter((node) => node.visibleFrom >= atlas.from.ordinal && node.visibleFrom <= atlas.through.ordinal);
}
export const atlasNodesInWindow = atlasFactsInWindow;

export function atlasFactRecordsInWindow(atlas: AtlasData) {
  if (atlas.scope === "through") return atlas.facts;
  return atlas.facts.filter((fact) => fact.visibleFrom >= atlas.from.ordinal && fact.visibleFrom <= atlas.through.ordinal);
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
