import type { Route } from "./+types/reference";
import { EmptyState } from "~/components/EmptyState";
import { ReferenceNav } from "~/components/ReferenceNav";
import { SearchForm } from "~/components/SearchForm";
import { SpoilerGate } from "~/components/SpoilerGate";
import { getDb } from "~/lib/cloudflare-context";
import {
  getNovel,
  getReferenceCounts,
  listCharacters,
  listContinuities,
  listGlossary,
  listLocations,
  listQaLogs,
  listTerminologies,
} from "~/lib/repository";
import { readSearchParam, validateRouteSegment } from "~/lib/params";

const allowed = new Set(["characters", "locations", "terminology", "glossary", "continuity", "qa"]);

function splitText(value: string) {
  const emDash = value.indexOf(" — ");
  if (emDash > 0) return [value.slice(0, emDash), value.slice(emDash + 3)];
  const colon = value.indexOf(": ");
  if (colon > 0) return [value.slice(0, colon), value.slice(colon + 2)];
  return [value, ""];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const novelId = validateRouteSegment(params.novelId, "novel id");
  const reference = validateRouteSegment(params.reference, "reference section");
  if (!allowed.has(reference)) throw new Response("Reference section not found.", { status: 404 });
  const q = readSearchParam(new URL(request.url).searchParams.get("q"));
  const db = getDb(context);
  const [novel, counts] = await Promise.all([getNovel(db, novelId), getReferenceCounts(db, novelId)]);
  if (!novel) throw new Response("Novel not found.", { status: 404 });

  let title = "Reference";
  let description = "Story context stored with this novel.";
  let items: unknown[] = [];

  if (reference === "characters") {
    title = "Characters";
    description = "Names and descriptions retained by the translation memory.";
    items = await listCharacters(db, novelId, q);
  } else if (reference === "locations") {
    title = "Places";
    description = "Locations recorded for recurring geographic consistency.";
    items = await listLocations(db, novelId, q);
  } else if (reference === "terminology") {
    title = "Terminology";
    description = "Named systems, ranks, techniques, and recurring project terms.";
    items = await listTerminologies(db, novelId, q);
  } else if (reference === "glossary") {
    title = "Glossary";
    description = "Canonical source-to-translation mappings when glossary rows exist.";
    items = await listGlossary(db, novelId, q);
  } else if (reference === "continuity") {
    title = "Continuity";
    description = "Story-state constraints used to keep later translation consistent.";
    items = await listContinuities(db, novelId, q);
  } else {
    title = "QA notes";
    description = "Translation decisions, corrections, and recorded source issues.";
    items = await listQaLogs(db, novelId, q);
  }

  return { novel, counts, reference, title, description, q, items };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `${data.title} — ${data.novel.title || data.novel.novelId}` : "Reference — The Reading Room" }];
}

export default function Reference({ loaderData }: Route.ComponentProps) {
  const { novel, counts, reference, title, description, q, items } = loaderData;
  let content: React.ReactNode;

  if (reference === "characters") {
    const rows = items as Array<{ id: number; name: string; description: string }>;
    content = rows.length ? (
      <div className="reference-grid">{rows.map((item) => (
        <article className="reference-card" key={item.id}>
          <p className="reference-card__index">CHARACTER</p>
          <h2>{item.name || "Unnamed character"}</h2>
          <p>{item.description || "No description stored."}</p>
        </article>
      ))}</div>
    ) : <EmptyState title="No characters found" detail={q ? "No character matched the search." : "No character rows are stored for this novel."} />;
  } else if (reference === "glossary") {
    const rows = items as Array<{ id: number; sourceTerm: string; canonicalTranslation: string; type: string; firstSeen: string; notes: string }>;
    content = rows.length ? (
      <div className="reference-grid">{rows.map((item) => (
        <article className="reference-card" key={item.id}>
          <p className="reference-card__index">{item.type || "GLOSSARY"}</p>
          <h2>{item.sourceTerm || "Unnamed term"}</h2>
          <p className="reference-card__translation">{item.canonicalTranslation || "No canonical translation"}</p>
          {item.notes ? <p>{item.notes}</p> : null}
          {item.firstSeen ? <span className="badge">First seen: {item.firstSeen}</span> : null}
        </article>
      ))}</div>
    ) : <EmptyState title="Glossary is empty" detail={q ? "No glossary term matched the search." : "This is a valid state: existing migrated rows may not contain glossary data yet."} />;
  } else {
    const rows = items as Array<{ id: number; text: string }>;
    const cards = rows.length ? (
      <div className="reference-grid">{rows.map((item) => {
        const [name, detail] = splitText(item.text);
        return (
          <article className="reference-card" key={item.id}>
            <p className="reference-card__index">{reference.toUpperCase()}</p>
            <h2>{name || title}</h2>
            {detail ? <p>{detail}</p> : null}
          </article>
        );
      })}</div>
    ) : <EmptyState title={`No ${title.toLowerCase()} found`} detail={q ? "Nothing matched this search." : `No ${title.toLowerCase()} rows are stored for this novel.`} />;
    content = reference === "continuity" || reference === "qa" ? <SpoilerGate label={`Reveal ${title.toLowerCase()}`}>{cards}</SpoilerGate> : cards;
  }

  return (
    <div className="page-shell reference-page">
      <header className="page-intro page-intro--compact">
        <p className="eyebrow">{novel.title || novel.novelId}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <ReferenceNav novelId={novel.novelId} active={reference} counts={counts} />
      <SearchForm q={q} placeholder={`Search ${title.toLowerCase()}…`} />
      {content}
    </div>
  );
}
