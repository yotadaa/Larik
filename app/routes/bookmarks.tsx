import { Form, Link } from "react-router";
import { ArrowRightIcon, BookOpenIcon, BookmarkIcon } from "@heroicons/react/24/outline";
import type { Route } from "./+types/bookmarks";
import { BookmarkButton } from "~/components/BookmarkButton";
import { CustomSelect } from "~/components/CustomSelect";
import { EmptyState } from "~/components/EmptyState";
import { Pagination } from "~/components/Pagination";
import { requireUser } from "~/lib/auth.server";
import { bookmarkAction, listBookmarks } from "~/lib/bookmarks.server";
import { getDb } from "~/lib/cloudflare-context";
import { hrefChapter, hrefNovel, readPositiveInt, readSearchParam } from "~/lib/params";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = getDb(context);
  const user = await requireUser(db, request);
  const url = new URL(request.url);
  const bookmarks = await listBookmarks(db, user.id, { q: readSearchParam(url.searchParams.get("q")), kind: url.searchParams.get("kind") ?? "all", page: readPositiveInt(url.searchParams.get("page")) });
  return { user, bookmarks };
}
export async function action({ request, context }: Route.ActionArgs) { return bookmarkAction(getDb(context), request); }
export const meta = () => [{ title: "Bookmarks — The Reading Room" }, { name: "robots", content: "noindex" }];

export default function Bookmarks({ loaderData }: Route.ComponentProps) {
  const { user, bookmarks } = loaderData;
  return <div className="page-shell bookmarks-page">
    <header className="page-intro page-intro--compact bookmarks-intro"><div><p className="eyebrow">Your personal shelf</p><h1>Bookmarks</h1><p>Novels to return to. Chapters to keep close.</p></div><span className="shelf-count"><strong>{bookmarks.total}</strong><span>{bookmarks.q || bookmarks.kind !== "all" ? "matching saves" : "saved places"}</span></span></header>
    <p className="profile-note">Saved for <strong>{user.email}</strong>. Password protected; mailbox ownership is not yet verified by email delivery.</p>
    <Form method="get" className="shelf-filters" role="search" aria-label="Search bookmarks">
      <label className="shelf-search"><span className="sr-only">Search bookmarks</span><input name="q" type="search" aria-label="Search bookmarks" defaultValue={bookmarks.q} placeholder="Search your shelf..." maxLength={120} /></label>
      <CustomSelect name="kind" ariaLabel="Bookmark type" defaultValue={bookmarks.kind} options={[{ value: "all", label: "Everything" }, { value: "novel", label: "Novels" }, { value: "chapter", label: "Chapters" }]} />
      <button className="button" type="submit">Search</button>{bookmarks.q || bookmarks.kind !== "all" ? <Link to="/bookmarks" className="text-link">Reset</Link> : null}
    </Form>
    {bookmarks.items.length ? <><div className="bookmark-list">{bookmarks.items.map((item) => <article className="bookmark-row" key={`${item.novelId}:${item.chapterId}`}>
      <div className="bookmark-row__mark" aria-hidden="true">{item.chapterId ? <BookmarkIcon /> : <BookOpenIcon />}</div>
      <div className="bookmark-row__copy"><p className="eyebrow">{item.chapterId ? "Chapter" : "Novel"}</p><h2>{item.available ? <Link to={item.chapterId ? hrefChapter(item.novelId, item.chapterId) : hrefNovel(item.novelId)}>{item.chapterTitle || item.novelTitle}<ArrowRightIcon aria-hidden="true" /></Link> : item.chapterTitle || item.novelTitle}</h2>{item.chapterId ? <p>{item.novelTitle}</p> : null}<p className="bookmark-date">Saved <time dateTime={new Date(item.createdAt * 1000).toISOString()}>{new Date(item.createdAt * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</time>{item.available ? "" : " / Content unavailable"}</p></div>
      <BookmarkButton novelId={item.novelId} chapterId={item.chapterId} bookmarked user={user} />
    </article>)}</div><Pagination page={bookmarks.page} totalPages={bookmarks.totalPages} /></> : <section className="shelf-empty"><BookmarkIcon aria-hidden="true" /><EmptyState title={bookmarks.q || bookmarks.kind !== "all" ? "No matching bookmarks" : "A shelf waiting for a story"} detail={bookmarks.q || bookmarks.kind !== "all" ? "Try another search or reset the filters." : "Open a novel or chapter and choose Bookmark. It will be waiting here next time."} /><Link className="button button--ghost" to="/library"><BookOpenIcon aria-hidden="true" /><span>Explore the library</span></Link></section>}
  </div>;
}
