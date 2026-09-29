import { Link } from "react-router";
import { ArrowLeftIcon, ExclamationTriangleIcon, ShieldCheckIcon, ShareIcon } from "@heroicons/react/24/outline";
import type { Route } from "./+types/atlas";
import { AtlasBoundaryPicker } from "~/components/AtlasBoundaryPicker";
import { AtlasView } from "~/components/AtlasView";
import type { AtlasViewName } from "~/components/AtlasExplorer";
import { ReferenceNav } from "~/components/ReferenceNav";
import { getDb } from "~/lib/cloudflare-context";
import { getNovel } from "~/lib/repository";
import { listAtlasChapters, loadAtlasData } from "~/lib/atlas.server";
import type { AtlasScope } from "~/lib/atlas";
import { hrefNovel, validateRouteSegment } from "~/lib/params";
import { BRAND_NAME } from "~/lib/brand";

function atlasScope(value: string | null): AtlasScope {
  return value === "range" || value === "all" ? value : "through";
}

function atlasView(value: string | null): AtlasViewName {
  return value === "profiles" || value === "storyline" || value === "matrix" || value === "chronology" || value === "arcs" || value === "evidence" ? value : "graph";
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const novelId = validateRouteSegment(params.novelId, "novel id");
  const db = getDb(context);
  const [novel, coverage] = await Promise.all([getNovel(db, novelId), listAtlasChapters(db, novelId)]);
  if (!novel) throw new Response("Novel not found.", { status: 404 });
  const url = new URL(request.url);
  const view = atlasView(url.searchParams.get("view"));
  if (!coverage?.chapters.length) return { novel, coverage, selection: null, atlas: null, unlockHref: "", view };

  const mode = atlasScope(url.searchParams.get("mode"));
  const chapters = coverage.chapters;
  const first = chapters[0];
  const last = chapters.at(-1)!;
  const latestReviewed = [...chapters].reverse().find((chapter) => chapter.reviewed) ?? first;

  let throughId = mode === "all" ? last.chapterId : (url.searchParams.get("through") ?? "");
  let fromId = mode === "all" ? first.chapterId : mode === "range" ? (url.searchParams.get("from") ?? first.chapterId) : first.chapterId;
  if (!throughId) return {
    novel,
    coverage,
    selection: { mode, from: fromId, through: "", reveal: false, needsSpoilerUnlock: false, latestReviewed },
    atlas: null,
    unlockHref: "",
    view,
  };

  const from = chapters.find((chapter) => chapter.chapterId === fromId);
  const through = chapters.find((chapter) => chapter.chapterId === throughId);
  if (!from || !through) throw new Response("That chapter is not in this novel.", { status: 400 });
  if (from.ordinal > through.ordinal) throw new Response("The Story Atlas range start must not be after its end.", { status: 400 });

  const needsSpoilerUnlock = through.ordinal > latestReviewed.ordinal;
  const reveal = needsSpoilerUnlock && url.searchParams.get("reveal") === "1";
  const atlas = !needsSpoilerUnlock || reveal
    ? await loadAtlasData(db, novelId, {
      fromChapterId: from.chapterId,
      throughChapterId: through.chapterId,
      scope: mode,
      includeUnreviewed: reveal,
    })
    : null;

  const unlock = new URLSearchParams();
  unlock.set("mode", mode);
  if (mode === "range") unlock.set("from", from.chapterId);
  if (mode !== "all") unlock.set("through", through.chapterId);
  unlock.set("reveal", "1");
  if (view !== "graph") unlock.set("view", view);
  const unlockHref = `/novels/${encodeURIComponent(novelId)}/atlas?${unlock.toString()}`;

  return {
    novel,
    coverage,
    selection: { mode, from: from.chapterId, through: through.chapterId, reveal, needsSpoilerUnlock, latestReviewed },
    atlas,
    unlockHref,
    view,
  };
}
export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Story Atlas — ${loaderData?.novel.title ?? "Novel"} — ${BRAND_NAME}` }, { name: "robots", content: "noindex" }];
}
export default function Atlas({ loaderData }: Route.ComponentProps) {
  const { novel, coverage, selection, atlas, unlockHref, view } = loaderData;
  const reviewedCount = coverage?.chapters.filter((chapter) => chapter.reviewed).length ?? 0;
  const totalCount = coverage?.chapters.length ?? 0;
  return <div className="page-shell atlas-page">
    <header className="page-intro page-intro--compact"><p className="eyebrow">{novel.title || novel.novelId} / Story reference</p><h1>Story Atlas</h1><p>Explore a single reveal window, a chapter range, or the complete imported story. Later metadata is always behind an explicit spoiler warning.</p></header>
    <ReferenceNav novelId={novel.novelId} active={view === "profiles" ? "profiles" : "atlas"} />
    {!coverage ? <section className="atlas-gate"><ShareIcon className="atlas-gate-icon" aria-hidden="true" /><p className="eyebrow">Curated knowledge required</p><h2>No Story Atlas dataset has been published for this novel yet.</h2><p>The app deliberately fails closed instead of deriving relationships during a request.</p></section> : <>
      <section className="atlas-boundary-card">
        <ShieldCheckIcon aria-hidden="true" />
        <div><p className="eyebrow">Visualization scope</p><h2>Choose how much of the story to reveal.</h2><p><strong>Through chapter</strong> is cumulative, <strong>Chapter range</strong> centers discoveries/events on a window while retaining already-revealed relationships or states that are still valid there, and <strong>Entire story</strong> opens all imported metadata.</p><p className="field-help">Manually reviewed boundaries: {reviewedCount}. Imported chapter boundaries: {totalCount}. {coverage.coverageNote}</p></div>
        <AtlasBoundaryPicker novelId={novel.novelId} chapters={coverage.chapters} mode={selection?.mode ?? "through"} selectedFrom={selection?.from ?? ""} selectedThrough={selection?.through ?? ""} view={view === "graph" ? undefined : view} />
      </section>

      {selection?.needsSpoilerUnlock && !selection.reveal ? <section className="atlas-spoiler-unlock" role="alert">
        <ExclamationTriangleIcon aria-hidden="true" />
        <div>
          <p className="eyebrow">Spoiler warning</p>
          <h2>This selection goes beyond manually reviewed chapter {selection.latestReviewed.ordinal}.</h2>
          <p>The remaining visualization uses the normalized metadata snapshot stored in D1: entities, aliases, relationships, atomic facts, events, states, scenes, arcs, and cycles. It can reveal story information up to your selected end boundary. Unreviewed rows stay explicitly labeled and are never promoted to reviewed facts.</p>
          <Link className="button button--primary" to={unlockHref}>{selection.mode === "all" ? `Reveal all ${totalCount} chapters` : "Reveal this chapter window"}</Link>
        </div>
      </section> : null}

      {atlas?.unreviewedUnlocked ? <section className="atlas-coverage-warning" role="status">
        <ExclamationTriangleIcon aria-hidden="true" />
        <div><strong>Spoiler metadata is unlocked through chapter {atlas.through.ordinal}.</strong><p>Manually reviewed rows remain marked as reviewed. Later structured metadata stays labeled as unreviewed so imported facts, relationships, events, states, and scenes are never presented as editorially verified by accident.</p></div>
      </section> : null}

      {atlas ? <AtlasView atlas={atlas} initialView={view} /> : selection?.needsSpoilerUnlock ? null : <section className="atlas-gate atlas-gate--compact"><p className="eyebrow">Choose a scope</p><h2>Select a chapter window to begin.</h2><p>You can stay inside reviewed coverage or explicitly unlock later spoiler metadata.</p></section>}
    </>}
    <div className="atlas-back"><Link className="button button--ghost" to={hrefNovel(novel.novelId)}><ArrowLeftIcon aria-hidden="true" /><span>Back to novel</span></Link></div>
  </div>;
}
