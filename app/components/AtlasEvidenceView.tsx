import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { CustomSelect } from "./CustomSelect";
import { atlasEdgesInWindow, atlasWindowBounds, type AtlasData } from "~/lib/atlas";

type EvidenceKind = "fact" | "event" | "state" | "scene" | "relation";
type EvidenceItem = {
  id: string;
  chapter: number;
  chapterId: string;
  href: string;
  kind: EvidenceKind;
  title: string;
  evidence: string;
  status: string;
  reviewed: boolean;
};

const KIND_LABEL: Record<EvidenceKind, string> = { fact: "Facts", event: "Events", state: "States", scene: "Scenes", relation: "Relations" };

export function AtlasEvidenceView({ atlas }: { atlas: AtlasData }) {
  const { start, end } = atlasWindowBounds(atlas);
  const byId = useMemo(() => new Map(atlas.nodes.map((node) => [node.id, node])), [atlas.nodes]);
  const items = useMemo<EvidenceItem[]>(() => {
    const result: EvidenceItem[] = [];
    atlas.facts.forEach((fact) => result.push({ id: fact.id, chapter: fact.visibleFrom, chapterId: fact.source.chapterId, href: fact.source.href, kind: "fact", title: `${byId.get(fact.subjectId)?.label ?? fact.subjectId} · ${fact.predicate.replaceAll("_", " ")} · ${fact.objectValue}`, evidence: fact.evidence, status: fact.epistemicStatus, reviewed: fact.reviewed }));
    atlas.events.forEach((event) => result.push({ id: event.id, chapter: event.chapterOrdinal, chapterId: event.source.chapterId, href: event.source.href, kind: "event", title: event.summary || event.label, evidence: event.evidence, status: event.certainty || event.kind, reviewed: event.reviewed }));
    atlas.states.filter((state) => state.visibleFrom >= start && state.visibleFrom <= end).forEach((state) => result.push({ id: state.id, chapter: state.visibleFrom, chapterId: state.source.chapterId, href: state.source.href, kind: "state", title: `${byId.get(state.entityId)?.label ?? state.entityId} · ${state.property.replaceAll("_", " ")} · ${state.value}`, evidence: state.evidence, status: state.certainty, reviewed: state.reviewed }));
    atlas.scenes.forEach((scene) => result.push({ id: scene.id, chapter: scene.chapterOrdinal, chapterId: scene.source.chapterId, href: scene.source.href, kind: "scene", title: scene.summary || scene.id, evidence: scene.evidence, status: scene.timeMarker || "scene", reviewed: scene.reviewed }));
    atlasEdgesInWindow(atlas).forEach((edge) => result.push({ id: edge.id, chapter: edge.visibleFrom, chapterId: edge.sourceRef.chapterId, href: edge.sourceRef.href, kind: "relation", title: `${byId.get(edge.source)?.label ?? edge.source} / ${edge.label} / ${byId.get(edge.target)?.label ?? edge.target}`, evidence: edge.evidence, status: edge.certainty || edge.status || "relationship", reviewed: edge.reviewed }));
    return result.sort((a, b) => a.chapter - b.chapter || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  }, [atlas, byId, end, start]);
  const chapters = useMemo(() => {
    const grouped = new Map<number, EvidenceItem[]>();
    for (const item of items) {
      const rows = grouped.get(item.chapter) ?? [];
      rows.push(item);
      grouped.set(item.chapter, rows);
    }
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  }, [items]);
  const [selectedChapter, setSelectedChapter] = useState(() => String(chapters.at(-1)?.[0] ?? ""));
  useEffect(() => {
    if (!chapters.some(([chapter]) => String(chapter) === selectedChapter)) {
      setSelectedChapter(String(chapters.at(-1)?.[0] ?? ""));
    }
  }, [chapters, selectedChapter]);
  const selectedNumber = Number(selectedChapter || chapters.at(-1)?.[0] || 0);
  const selectedItems = chapters.find(([chapter]) => chapter === selectedNumber)?.[1] ?? [];
  const maxCount = Math.max(1, ...chapters.map(([, rows]) => rows.length));

  if (!items.length) return <section className="atlas-visual-card empty-state"><h2>No provenance rows in this window</h2><p>Facts, events, states, scenes, and relationships will appear here once their structured metadata is present.</p></section>;

  return <section className="atlas-visual-card atlas-provenance" aria-labelledby="provenance-title">
    <div className="atlas-visual-heading">
      <div><p className="eyebrow">Evidence provenance</p><h2 id="provenance-title">What is supported where</h2></div>
      <p>Each bar is a source chapter and each segment is a stored metadata record. This is an audit view, not a graph inference layer. Current window: Ch. {start}–{end}.</p>
    </div>
    <div className="atlas-provenance__bars" aria-label="Metadata provenance by chapter">{chapters.map(([chapter, rows]) => {
      const counts = new Map<EvidenceKind, number>();
      rows.forEach((row) => counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1));
      return <button type="button" key={chapter} className={chapter === selectedNumber ? "is-selected" : ""} onClick={() => setSelectedChapter(String(chapter))} aria-pressed={chapter === selectedNumber}>
        <span className="atlas-provenance__chapter">Ch. {chapter}</span>
        <span className="atlas-provenance__bar" style={{ "--bar-scale": `${Math.max(0.08, rows.length / maxCount) * 100}%` } as CSSProperties}>{([...counts.entries()] as [EvidenceKind, number][]).map(([kind, count]) => <i key={kind} className={`is-${kind}`} style={{ flexGrow: count }} title={`${KIND_LABEL[kind]}: ${count}`} />)}</span>
        <strong>{rows.length}</strong>
      </button>;
    })}</div>
    <div className="atlas-provenance__legend">{(Object.keys(KIND_LABEL) as EvidenceKind[]).map((kind) => <span key={kind}><i className={`is-${kind}`} />{KIND_LABEL[kind]}</span>)}</div>
    <div className="atlas-provenance__inspector">
      <div className="atlas-provenance__select"><CustomSelect ariaLabel="Provenance chapter" value={String(selectedNumber)} onChange={setSelectedChapter} options={chapters.map(([chapter, rows]) => ({ value: String(chapter), label: `Chapter ${chapter} · ${rows.length} records` }))} /></div>
      <div className="atlas-provenance__records">{selectedItems.map((item) => <article key={`${item.kind}:${item.id}`} className={item.reviewed ? "is-reviewed" : "is-metadata"}>
        <span className={`atlas-provenance__kind is-${item.kind}`}>{KIND_LABEL[item.kind]}</span><div><strong>{item.title}</strong><small>{item.status || (item.reviewed ? "reviewed" : "unreviewed")}</small>{item.evidence ? <blockquote>{item.evidence}</blockquote> : null}{item.href ? <Link to={item.href}>Open source chapter</Link> : null}</div>
      </article>)}</div>
    </div>
    {atlas.integrityIssueCount ? <p className="atlas-provenance__warning">The active metadata snapshot still reports {atlas.integrityIssueCount} integrity warning(s). This view preserves those source boundaries rather than silently repairing them.</p> : null}
  </section>;
}
