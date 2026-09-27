import { Link } from "react-router";
import { ArrowLeftIcon, ArrowRightIcon, BookOpenIcon } from "@heroicons/react/24/outline";
import type { Route } from "./+types/novel";
import { EmptyState } from "~/components/EmptyState";
import { Pagination } from "~/components/Pagination";
import { ReferenceNav } from "~/components/ReferenceNav";
import { SearchForm } from "~/components/SearchForm";
import { getDb } from "~/lib/cloudflare-context";
import { getNovel, getReferenceCounts, listChapters } from "~/lib/repository";
import { hrefChapter, readPositiveInt, readSearchParam, validateRouteSegment } from "~/lib/params";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const novelId = validateRouteSegment(params.novelId, "novel id");
  const url = new URL(request.url);
  const q = readSearchParam(url.searchParams.get("q"));
  const page = readPositiveInt(url.searchParams.get("page"));
  const db = getDb(context);
  const [novel, chapters, counts] = await Promise.all([
    getNovel(db, novelId),
    listChapters(db, novelId, { q, page, pageSize: 60 }),
    getReferenceCounts(db, novelId),
  ]);
  if (!novel) throw new Response("Novel not found.", { status: 404 });
  return { novel, chapters, counts, q };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.novel.title || loaderData.novel.novelId} — The Reading Room` : "Novel — The Reading Room" }];
}

export default function Novel({ loaderData }: Route.ComponentProps) {
  const { novel, chapters, counts, q } = loaderData;
  const first = !q && chapters.page === 1 ? chapters.items[0] : undefined;
  return (
    <div className="page-shell novel-page">
      <header className="novel-hero">
        <div className="novel-hero__spine" aria-hidden="true"><span>{(novel.title || novel.novelId).slice(0, 1).toUpperCase()}</span></div>
        <div className="novel-hero__copy">
          <p className="eyebrow">{novel.lang || "Unknown language"} · Novel</p>
          <h1>{novel.title || novel.novelId}</h1>
          <p className="novel-hero__slug">{novel.novelId}</p>
          <div className="novel-hero__facts"><span><strong>{novel.chapterCount}</strong> chapters</span><span>Story reference included</span></div>
          <div className="button-row">
            {first ? (
              <Link className="button button--primary" to={hrefChapter(novel.novelId, first.chapterId)}>
                <span className="button__icon"><BookOpenIcon aria-hidden="true" /></span>
                <span>Begin reading</span>
                <ArrowRightIcon className="button__arrow" aria-hidden="true" />
              </Link>
            ) : null}
            <Link className="button button--ghost" to="/library">
              <span className="button__icon"><ArrowLeftIcon aria-hidden="true" /></span>
              <span>Back to library</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="novel-reference-block">
        <div className="section-heading section-heading--split">
          <div><p className="eyebrow">Story atlas</p><h2>Context, when you need it</h2></div>
          <p>Reference material stays separate from the prose so reading remains focused. Continuity and QA notes are spoiler-gated.</p>
        </div>
        <ReferenceNav novelId={novel.novelId} counts={counts} />
      </section>

      <section className="chapter-section">
        <div className="section-heading section-heading--split">
          <div><p className="eyebrow">Chapters</p><h2>Table of contents</h2></div>
          <p>Chapter IDs are text in the database and may contain punctuation. Navigation preserves the exact identifier.</p>
        </div>
        <SearchForm q={q} placeholder="Search chapter title or ID…" />

        {chapters.items.length ? (
          <>
            <ol className="chapter-list">
              {chapters.items.map((chapter, index) => (
                <li className="chapter-item" key={chapter.chapterId}>
                  <span className="chapter-item__number">{String((chapters.page - 1) * chapters.pageSize + index + 1).padStart(3, "0")}</span>
                  <div className="chapter-item__copy">
                    <Link to={hrefChapter(novel.novelId, chapter.chapterId)}>
                      <span>{chapter.title || chapter.chapterId}</span>
                      <ArrowRightIcon aria-hidden="true" />
                    </Link>
                    <span className="chapter-item__id">{chapter.chapterId}</span>
                  </div>
                  {chapter.recapAvailable ? <span className="badge">Recap</span> : <span className="badge badge--quiet">No recap</span>}
                </li>
              ))}
            </ol>
            <Pagination page={chapters.page} totalPages={chapters.totalPages} />
          </>
        ) : <EmptyState title="No chapters found" detail={q ? "No chapter matched this search." : "This novel exists in D1 but has no chapter rows yet."} />}
      </section>
    </div>
  );
}
