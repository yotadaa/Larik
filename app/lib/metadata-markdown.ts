import { hrefChapter, hrefReference } from "./params.ts";

const REFERENCE_TARGETS: Record<string, string> = {
  characters: "characters",
  locations: "locations",
  terminology: "terminology",
  glossarium: "glossary",
  glossary: "glossary",
  continuity: "continuity",
  "qa-log": "qa",
  qa: "qa",
};

const ATLAS_TARGETS: Record<string, string> = {
  entities: "graph",
  aliases: "profiles",
  characteristics: "profiles",
  relationships: "matrix",
  facts: "evidence",
  events: "evidence",
  states: "chronology",
  scenes: "evidence",
  arcs: "arcs",
  cycles: "arcs",
};

function escapeMarkdownLabel(value: string) {
  return value.replace(/([\\\[\]])/g, "\\$1");
}

function normalizeTarget(raw: string) {
  const target = raw.trim().replace(/^\.\//, "");
  const [pathPart] = target.split("#", 1);
  return pathPart.replace(/^\/+/, "");
}

export function metadataWikilinkHref(novelId: string, rawTarget: string): string | null {
  const target = normalizeTarget(rawTarget);
  if (!target) return null;

  const chapterTarget = target.replace(/^(?:chapters|recaps)\//, "");
  if (/^\d{3}[-_]/.test(chapterTarget)) {
    const chapterId = chapterTarget.endsWith(".md") ? chapterTarget : `${chapterTarget}.md`;
    return hrefChapter(novelId, chapterId);
  }

  const basename = target.split("/").at(-1)?.replace(/\.md$/i, "").toLowerCase() ?? "";
  const reference = REFERENCE_TARGETS[basename];
  if (reference) return hrefReference(novelId, reference);
  const view = ATLAS_TARGETS[basename];
  if (view) return `/novels/${encodeURIComponent(novelId)}/atlas?view=${encodeURIComponent(view)}`;
  return null;
}

/**
 * Convert Obsidian-style wikilinks in stored metadata to reader-safe Markdown links.
 * Unknown wiki targets remain readable plain text instead of creating dead or unsafe links.
 */
export function prepareMetadataMarkdown(source: string, novelId?: string) {
  const normalized = (source ?? "").replace(/<br\s*\/?\s*>/gi, "  \n");
  return normalized.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, rawTarget: string, rawLabel?: string) => {
    const target = String(rawTarget).trim();
    const label = escapeMarkdownLabel(String(rawLabel ?? target).trim().replace(/\.md$/i, ""));
    if (!novelId) return label;
    const href = metadataWikilinkHref(novelId, target);
    return href ? `[${label}](${href})` : label;
  });
}
