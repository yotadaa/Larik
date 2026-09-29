import { Link } from "react-router";
import { ArrowRightIcon, ChevronDownIcon, MapIcon, SparklesIcon } from "@heroicons/react/24/outline";
import type { ChapterContextData } from "~/lib/atlas";
import { MetadataMarkdown } from "./MetadataMarkdown";

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ChapterContext({ novelId, data }: { novelId: string; data: ChapterContextData | null }) {
  if (!data) return null;
  const byId = new Map(data.entities.map((entity) => [entity.id, entity.label]));
  const label = (id: string) => byId.get(id) ?? id.replace(/^[a-z]+:/, "").replaceAll("-", " ");
  const total = data.scenes.length + data.events.length + data.facts.length + data.states.length + data.relationships.length;
  if (!total) return null;
  const params = new URLSearchParams({ mode: "range", from: data.chapter.chapterId, through: data.chapter.chapterId, view: "evidence" });

  return <aside className="reader-context" aria-label="Structured chapter context">
    <details>
      <summary>
        <span className="reader-context__label"><SparklesIcon aria-hidden="true" /><span><strong>Story context for this chapter</strong><small>Open after reading · {total} structured record(s)</small></span></span>
        <ChevronDownIcon className="reader-context__chevron" aria-hidden="true" />
      </summary>
      <div className="reader-context__body">
        <div className="reader-context__warning"><strong>Contains chapter-level spoilers.</strong><span>This section summarizes reviewed metadata revealed in Chapter {data.chapter.ordinal}. It stays collapsed so the novel remains the primary reading surface.</span></div>

        {data.scenes.length ? <section><div className="reader-context__section-heading"><MapIcon aria-hidden="true" /><div><p className="eyebrow">Scenes</p><h3>Where this chapter moves</h3></div></div><div className="reader-context__scene-grid">{data.scenes.map((scene) => <article key={scene.id}><span>Scene {scene.sceneOrder ?? "?"}{scene.cycleId ? ` · ${scene.cycleId}` : ""}</span><MetadataMarkdown source={scene.summary || "Reviewed scene"} novelId={novelId} variant="compact" className="reader-context__markdown-title" />{scene.locationIds.length ? <p>Place: {scene.locationIds.map(label).join(", ")}</p> : null}{scene.participantIds.length ? <p>Present: {scene.participantIds.map(label).join(", ")}</p> : null}{scene.timeMarker ? <small>{scene.timeMarker}</small> : null}</article>)}</div></section> : null}

        {data.events.length ? <section><p className="eyebrow">Events</p><h3>What changed</h3><ol className="reader-context__list">{data.events.map((event) => <li key={event.id}><span>{event.sceneOrder != null ? `Scene ${event.sceneOrder}` : `Ch. ${event.chapterOrdinal}`}</span><div><MetadataMarkdown source={event.summary || humanize(event.kind)} novelId={novelId} variant="compact" className="reader-context__markdown-title" />{event.certainty ? <small>{event.certainty}</small> : null}</div></li>)}</ol></section> : null}

        {data.states.length || data.facts.length || data.relationships.length ? <section><p className="eyebrow">Knowledge changes</p><h3>Newly revealed structured context</h3><div className="reader-context__knowledge">
          {data.states.map((state) => <article key={state.id}><span>State</span><strong>{label(state.entityId)}</strong><p>{humanize(state.property)} <ArrowRightIcon className="reader-context__inline-arrow" aria-hidden="true" /> {label(state.value)}</p>{state.cycleId ? <small>{state.cycleId}</small> : null}</article>)}
          {data.relationships.map((edge) => <article key={edge.id}><span>Relationship</span><strong>{label(edge.source)} <ArrowRightIcon className="reader-context__inline-arrow" aria-hidden="true" /> {label(edge.target)}</strong><p>{humanize(edge.relation)}</p>{edge.certainty ? <small>{edge.certainty}</small> : null}</article>)}
          {data.facts.map((fact) => <article key={fact.id}><span>{fact.epistemicStatus || "Fact"}</span><strong>{label(fact.subjectId)}</strong><div className="reader-context__statement"><span>{humanize(fact.predicate)}</span><ArrowRightIcon className="reader-context__inline-arrow" aria-hidden="true" /><MetadataMarkdown source={label(fact.objectValue)} novelId={novelId} variant="inline" /></div></article>)}
        </div></section> : null}

        <div className="reader-context__footer"><Link to={`/novels/${encodeURIComponent(novelId)}/atlas?${params.toString()}`}>Explore this chapter in Story Atlas</Link><span>Structured metadata is supporting context, not a replacement for the chapter prose.</span></div>
      </div>
    </details>
  </aside>;
}
