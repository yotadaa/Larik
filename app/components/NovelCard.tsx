import { Link } from "react-router";
import type { NovelSummary } from "~/lib/repository";
import { hrefNovel } from "~/lib/params";
import { NovelCover } from "~/components/NovelCover";

export function NovelCard({ novel }: { novel: NovelSummary; index?: number }) {
  const label = novel.title || novel.novelId;
  return (
    <article className="novel-card">
      <Link className="novel-card__visual" to={hrefNovel(novel.novelId)} aria-label={`Open ${label}`} title={label}>
        <NovelCover title={label} novelId={novel.novelId} lang={novel.lang} />
      </Link>
      <div className="novel-card__body">
        <h3><Link to={hrefNovel(novel.novelId)}>{label}</Link></h3>
        <p>{novel.chapterCount} chapter{novel.chapterCount === 1 ? "" : "s"}</p>
      </div>
    </article>
  );
}
