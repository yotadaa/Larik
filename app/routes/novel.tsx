import { Link } from "react-router";
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon, BookOpenIcon, ClockIcon } from "@heroicons/react/24/outline";
import type { Route } from "./+types/novel";
import { BookmarkButton } from "~/components/BookmarkButton";
import { EmptyState } from "~/components/EmptyState";
import { Pagination } from "~/components/Pagination";
import { ReferenceNav } from "~/components/ReferenceNav";
import { SearchForm } from "~/components/SearchForm";
import { ShelfStatusControl } from "~/components/ShelfStatusControl";
import { getUser } from "~/lib/auth.server";
import { bookmarkAction, isBookmarked } from "~/lib/bookmarks.server";
import { getDb } from "~/lib/cloudflare-context";
import { getReaderLibraryState } from "~/lib/reader-state.server";
import { getNovel, getReferenceCounts, listChapters } from "~/lib/repository";
import { hrefChapter, readPositiveInt, readSearchParam, validateRouteSegment } from "~/lib/params";
import { brandedTitle } from "~/lib/brand";

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
  const user = await getUser(db, request);
  const [bookmarked, readerState] = await Promise.all([
    user ? isBookmarked(db, user.id, novelId) : Promise.resolve(false),
    user ? getReaderLibraryState(db, user.id, novelId) : Promise.resolve(null),
  ]);
  return { novel, chapters, counts, q, user, bookmarked, readerState };
}

export async function action({ request, context }: Route.ActionArgs) { return bookmarkAction(getDb(context), request); }

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: brandedTitle(loaderData ? (loaderData.novel.title || loaderData.novel.novelId) : "Novel") }];
}

export default function Novel({ loaderData }: Route.ComponentProps) {
  const { novel, chapters, counts, q, user, bookmarked, readerState } = loaderData;
  const first = !q && chapters.page === 1 ? chapters.items[0] : undefined;
  return (
    <div className="page-shell novel-page">
      <header className="novel-hero">
        <div className="novel-hero__spine" aria-hidden="true"><span>{(novel.title || novel.novelId).slice(0, 1).toUpperCase()}</span></div>
        <div className="novel-hero__copy">
          <p className="eyebrow">{novel.lang || "Unknown language"} · Novel</p>
          <h1>{novel.title || novel.novelId}</h1>
          <p className="novel-hero__slug">{novel.sourceNovelId}</p>
          <div className="novel-hero__facts"><span><strong>{novel.chapterCount}</strong> chapters</span><span>Chapter-safe story atlas</span>{readerState ? <span><strong>{readerState.progressPercent}%</strong> last reading progress</span> : null}</div>
          <div className="button-row">
            {user && readerState?.lastChapterId ? <Link className="button button--primary" to={`${hrefChapter(novel.novelId, readerState.lastChapterId)}?resume=1`}><span className="button__icon"><ClockIcon aria-hidden="true" /></span><span>Resume reading</span><ArrowRightIcon className="button__arrow" aria-hidden="true" /></Link> : first ? (
              <Link className="button button--primary" to={hrefChapter(novel.novelId, first.chapterId)}>
                <span className="button__icon"><BookOpenIcon aria-hidden="true" /></span><span>Begin reading</span><ArrowRightIcon className="button__arrow" aria-hidden="true" />
              </Link>
            ) : null}
            <BookmarkButton key={novel.novelId} novelId={novel.novelId} user={user} bookmarked={bookmarked} />
            <Link className="button button--ghost" to="/library"><span className="button__icon"><ArrowLeftIcon aria-hidden="true" /></span><span>Back to library</span></Link>
          </div>
          <ShelfStatusControl novelId={novel.novelId} user={user} status={readerState?.status} />
        </div>
      </header>

      <section className="novel-reference-block">
        <div className="section-heading section-heading--split">
          <div><p className="eyebrow">Story atlas</p><h2>Context, when you need it</h2></div>
          <p>The atlas uses committed chapter boundaries from the local translation database. Future metadata is excluded before the response reaches your browser.</p>
        </div>
        <ReferenceNav novelId={novel.novelId} counts={counts} />
      </section>

      <section className="chapter-section">
        <div className="section-heading section-heading--split">
          <div><p className="eyebrow">Chapters</p><h2>Table of contents</h2></div>
          <p>Search reads completed local chapter translations directly from SQLite.</p>
        </div>
        <SearchForm q={q} placeholder="Search chapter title or text…" />

        {chapters.items.length ? <>
          <ol className="chapter-list">
            {chapters.items.map((chapter, index) => <li className="chapter-item" key={chapter.chapterId}>
              <span className="chapter-item__number">{q ? <ArrowUpRightIcon aria-label="Search result" /> : String((chapters.page - 1) * chapters.pageSize + index + 1).padStart(3, "0")}</span>
              <div className="chapter-item__copy">
                <Link to={hrefChapter(novel.novelId, chapter.chapterId)}><span>{chapter.title || chapter.chapterId}</span><ArrowRightIcon aria-hidden="true" /></Link>
                <span className="chapter-item__id">Chapter {chapter.chapterId}</span>
                {chapter.excerpt ? <p className="chapter-item__excerpt">{chapter.excerpt}</p> : null}
              </div>
              {chapter.recapAvailable ? <span className="badge">Recap</span> : <span className="badge badge--quiet">No recap</span>}
            </li>)}
          </ol>
          <Pagination page={chapters.page} totalPages={chapters.totalPages} />
        </> : <EmptyState title="No chapters found" detail={q ? "No indexed chapter text matched this search." : "This novel exists in local SQLite but has no completed chapter rows yet."} />}
      </section>
    </div>
  );
}
