import { Link, useFetcher, useLocation } from "react-router";
import { BookmarkIcon } from "@heroicons/react/24/outline";
import { BookmarkIcon as SavedBookmarkIcon } from "@heroicons/react/24/solid";
import type { ReaderUser } from "~/lib/auth.server";
import type { BookmarkResult } from "~/lib/bookmarks.server";

export function BookmarkButton({ novelId, chapterId = "", bookmarked, user, compact = false, action }: {
  novelId: string; chapterId?: string; bookmarked: boolean; user: ReaderUser | null;
  compact?: boolean; action?: string;
}) {
  const fetcher = useFetcher<BookmarkResult>();
  const location = useLocation();
  const returnTo = location.pathname + location.search;
  const busy = fetcher.state !== "idle";
  const saved = fetcher.formData ? fetcher.formData.get("intent") === "save" : fetcher.data?.saved ?? bookmarked;
  const className = compact ? "dock-control bookmark-control" : "button button--ghost bookmark-control";
  const target = chapterId ? "chapter" : "novel";
  if (!user) {
    return <Link className={className} to={`/login?returnTo=${encodeURIComponent(returnTo)}`} title={`Sign in to bookmark this ${target}`}>
      <BookmarkIcon aria-hidden="true" /><span>{compact ? "Bookmark" : `Bookmark ${target}`}</span>
    </Link>;
  }
  const Icon = saved ? SavedBookmarkIcon : BookmarkIcon;
  return (
    <div className={compact ? "bookmark-widget bookmark-widget--compact" : "bookmark-widget"}>
      <fetcher.Form method="post" action={action ?? returnTo}>
        <input type="hidden" name="novelId" value={novelId} />
        <input type="hidden" name="chapterId" value={chapterId} />
        <input type="hidden" name="intent" value={saved ? "remove" : "save"} />
        <button className={`${className}${saved ? " is-saved" : ""}`} type="submit" disabled={busy} aria-pressed={saved}
          aria-label={`${saved ? "Remove bookmark for" : "Bookmark"} this ${target}`}>
          <Icon aria-hidden="true" /><span>{busy ? "Saving..." : saved ? "Saved" : compact ? "Bookmark" : `Bookmark ${target}`}</span>
        </button>
      </fetcher.Form>
      <span className={fetcher.data?.error ? "form-error bookmark-feedback" : "sr-only"} role={fetcher.data?.error ? "alert" : "status"}>
        {fetcher.data?.error ?? (busy ? "Updating bookmark." : fetcher.data?.message ?? "")}
      </span>
    </div>
  );
}
