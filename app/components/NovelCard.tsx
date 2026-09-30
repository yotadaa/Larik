import { Link } from "react-router";
import { ArrowUpRightIcon } from "@heroicons/react/24/outline";
import type { NovelSummary } from "~/lib/repository";
import { hrefNovel } from "~/lib/params";

function initials(title: string) {
  const words = title.split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((word) => word[0]).join("") || "N").toUpperCase();
}

export function NovelCard({ novel, index = 0 }: { novel: NovelSummary; index?: number }) {
  const label = novel.title || novel.novelId;
  return (
    <article className="novel-card">
      <Link className="novel-card__visual" to={hrefNovel(novel.novelId)} aria-label={`Open ${label}`}>
        <span className="novel-card__number">{String(index + 1).padStart(2, "0")}</span>
        <span className="novel-card__initials" aria-hidden="true">{initials(label)}</span>
        <span className="novel-card__open" aria-hidden="true"><ArrowUpRightIcon /></span>
        <span className="novel-card__lang">{novel.lang || "N/A"}</span>
      </Link>
      <div className="novel-card__body">
        <p className="eyebrow">{novel.lang || "Unknown language"}</p>
        <h3><Link to={hrefNovel(novel.novelId)}>{label}</Link></h3>
        <p>{novel.chapterCount} chapter{novel.chapterCount === 1 ? "" : "s"}</p>
      </div>
    </article>
  );
}
