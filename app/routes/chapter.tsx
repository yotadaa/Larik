import { Link } from "react-router";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import type { Route } from "./+types/chapter";
import { Markdown } from "~/components/Markdown";
import { ReaderControls } from "~/components/ReaderControls";
import { ReadingProgress } from "~/components/ReadingProgress";
import { getDb } from "~/lib/cloudflare-context";
import { getChapter } from "~/lib/repository";
import { hrefChapter, hrefNovel, validateRouteSegment } from "~/lib/params";

export async function loader({ params, context }: Route.LoaderArgs) {
  const novelId = validateRouteSegment(params.novelId, "novel id");
  const chapterId = validateRouteSegment(params.chapterId, "chapter id");
  const navigation = await getChapter(getDb(context), novelId, chapterId);
  if (!navigation) throw new Response("Chapter not found.", { status: 404 });
  return navigation;
}

export function meta({ loaderData }: Route.MetaArgs) {
  const chapter = loaderData?.current;
  return [{ title: chapter ? `${chapter.title || chapter.chapterId} — ${chapter.novelTitle || "The Reading Room"}` : "Chapter — The Reading Room" }];
}

export default function Chapter({ loaderData }: Route.ComponentProps) {
  const { current, previous, next } = loaderData;
  return (
    <div className="reader-page">
      <ReadingProgress novelId={current.novelId} chapterId={current.chapterId} />
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
          <ReaderControls />
        </div>
      </div>

      <article className="reader-article">
        <header className="reader-heading">
          <p className="eyebrow">{current.lang || "Novel chapter"}</p>
          <h1>{current.title || current.chapterId}</h1>
          <p className="reader-heading__id">{current.chapterId}</p>
        </header>
        <Markdown source={current.content.split('\n').slice(11).join('\n')} stripHeading />
      </article>

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
