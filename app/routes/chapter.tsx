import { Link } from "react-router";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import type { Route } from "./+types/chapter";
import { InlineLookup } from "~/components/InlineLookup";
import { ReaderDock } from "~/components/ReaderDock";
import { getUser } from "~/lib/auth.server";
import { bookmarkAction, isBookmarked } from "~/lib/bookmarks.server";
import { parseChapterDocument } from "~/lib/chapter-markdown";
import { Markdown } from "~/components/Markdown";
import { ReaderControls } from "~/components/ReaderControls";
import { ReadingProgress } from "~/components/ReadingProgress";
import { getDb } from "~/lib/cloudflare-context";
import { loadInlineLookup } from "~/lib/atlas.server";
import { getReaderLibraryState } from "~/lib/reader-state.server";
import { getChapter } from "~/lib/repository";
import { hrefChapter, hrefNovel, validateRouteSegment } from "~/lib/params";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const novelId = validateRouteSegment(params.novelId, "novel id");
  const chapterId = validateRouteSegment(params.chapterId, "chapter id");
  const db = getDb(context);
  const navigation = await getChapter(db, novelId, chapterId);
  if (!navigation) throw new Response("Chapter not found.", { status: 404 });
  const user = await getUser(db, request);
  const resumeRequested = new URL(request.url).searchParams.get("resume") === "1";
  const [bookmarked, readerState, lookup] = await Promise.all([
    user ? isBookmarked(db, user.id, novelId, chapterId) : Promise.resolve(false),
    user ? getReaderLibraryState(db, user.id, novelId) : Promise.resolve(null),
    loadInlineLookup(db, novelId, chapterId),
  ]);
  const restoreStoredProgress = Boolean(user && resumeRequested && readerState?.lastChapterId === chapterId);
  return { ...navigation, user, bookmarked, readerState, lookup, restoreStoredProgress };
}

export async function action({ request, context }: Route.ActionArgs) { return bookmarkAction(getDb(context), request); }

export function meta({ loaderData }: Route.MetaArgs) {
  const chapter = loaderData?.current;
  return [{ title: chapter ? `${chapter.title || chapter.chapterId} — ${chapter.novelTitle || "The Reading Room"}` : "Chapter — The Reading Room" }];
}

export default function Chapter({ loaderData }: Route.ComponentProps) {
  const { current, previous, next, user, bookmarked, readerState, lookup, restoreStoredProgress } = loaderData;
  const document = parseChapterDocument(current.content);
  const storedPercent = readerState?.lastChapterId === current.chapterId ? readerState.progressPercent : -1;
  return (
    <div className="reader-page">
      <ReadingProgress novelId={current.novelId} chapterId={current.chapterId} authenticated={Boolean(user)} storedPercent={storedPercent} restoreStoredProgress={restoreStoredProgress} />
      <div className="reader-toolbar">
        <div className="reader-toolbar__inner">
          <div className="reader-toolbar__crumb">
            <Link className="reader-toolbar__back" to={hrefNovel(current.novelId)}>
              <ArrowLeftIcon aria-hidden="true" />
              <span>{current.novelTitle || "Novel"}</span>
            </Link>
            <ChevronRightIcon className="reader-toolbar__separator" aria-hidden="true" />
            <span className="reader-toolbar__current">{current.title || current.chapterId}</span>
          </div>
          <div className="reader-toolbar__actions"><InlineLookup data={lookup} /><ReaderControls /></div>
        </div>
      </div>

      <article className="reader-article">
        <header className="reader-heading">
          <p className="eyebrow">{current.lang || "Novel chapter"}</p>
          <h1>{current.title || current.chapterId}</h1>
          <p className="reader-heading__id">{current.chapterId}</p>
        </header>
        <Markdown source={document.body} />
      </article>

      {document.notes ? <aside className="reader-recap"><details><summary>Chapter notes</summary><Markdown source={document.notes} /></details></aside> : null}
      <ReaderDock key={`${current.novelId}:${current.chapterId}`} navigation={loaderData} user={user} bookmarked={bookmarked} />
      <aside className="reader-recap" aria-label="Chapter recap">
        <details>
          <summary>
            <span className="reader-recap__label">
              <DocumentTextIcon aria-hidden="true" />
              <span>{current.recap.trim() ? "Open chapter recap" : "Chapter recap"}</span>
            </span>
            <ChevronDownIcon className="reader-recap__chevron" aria-hidden="true" />
          </summary>
          {current.recap.trim() ? <Markdown source={current.recap} stripHeading /> : <p className="muted">No recap is stored for this chapter.</p>}
        </details>
      </aside>

      <nav className="reader-nav" aria-label="Chapter navigation">
        {previous ? (
          <Link to={hrefChapter(current.novelId, previous.chapterId)}>
            <span className="reader-nav__direction"><ArrowLeftIcon aria-hidden="true" /><small>Previous</small></span>
            <strong>{previous.title || previous.chapterId}</strong>
          </Link>
        ) : <span />}
        {next ? (
          <Link to={hrefChapter(current.novelId, next.chapterId)}>
            <span className="reader-nav__direction"><small>Next</small><ArrowRightIcon aria-hidden="true" /></span>
            <strong>{next.title || next.chapterId}</strong>
          </Link>
        ) : <span />}
      </nav>
    </div>
  );
}
