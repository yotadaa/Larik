import { useNavigate } from "react-router";
import { CustomSelect } from "./CustomSelect";
import type { AtlasChapterBoundary, AtlasScope } from "~/lib/atlas";

function chapterOption(chapter: AtlasChapterBoundary) {
  return {
    value: chapter.chapterId,
    label: `Chapter ${chapter.ordinal} — ${chapter.title || chapter.chapterId}${chapter.reviewed ? " · reviewed" : " · spoiler metadata"}`,
  };
}

export function AtlasBoundaryPicker({
  novelId,
  chapters,
  mode,
  selectedFrom,
  selectedThrough,
  view,
}: {
  novelId: string;
  chapters: AtlasChapterBoundary[];
  mode: AtlasScope;
  selectedFrom: string;
  selectedThrough: string;
  view?: string;
}) {
  const navigate = useNavigate();
  const first = chapters[0]?.chapterId ?? "";
  const lastReviewed = [...chapters].reverse().find((chapter) => chapter.reviewed)?.chapterId ?? first;
  const currentThrough = selectedThrough || lastReviewed;
  const currentFrom = selectedFrom || first;
  const options = chapters.map(chapterOption);
  const base = `/novels/${encodeURIComponent(novelId)}/atlas`;

  const go = (nextMode: AtlasScope, from = currentFrom, through = currentThrough) => {
    if (nextMode === "all") {
      const params = new URLSearchParams({ mode: "all" });
      if (view) params.set("view", view);
      navigate(`${base}?${params.toString()}`);
      return;
    }
    const params = new URLSearchParams({ mode: nextMode, through });
    if (view) params.set("view", view);
    if (nextMode === "range") params.set("from", from);
    navigate(`${base}?${params.toString()}`);
  };

  const fromOrdinal = chapters.find((chapter) => chapter.chapterId === currentFrom)?.ordinal ?? 1;
  const throughOrdinal = chapters.find((chapter) => chapter.chapterId === currentThrough)?.ordinal ?? fromOrdinal;

  return <div className="atlas-boundary-picker">
    <div className="atlas-range-modes" role="group" aria-label="Story Atlas chapter scope">
      <button type="button" aria-pressed={mode === "through"} onClick={() => go("through")}>Through chapter</button>
      <button type="button" aria-pressed={mode === "range"} onClick={() => go("range")}>Chapter range</button>
      <button type="button" aria-pressed={mode === "all"} onClick={() => go("all")}>Entire story</button>
    </div>

    {mode === "through" ? <div className="atlas-range-field">
      <span>Show story knowledge through</span>
      <CustomSelect ariaLabel="Show Story Atlas through chapter" value={currentThrough} options={options}
        onChange={(value) => go("through", first, value)} />
    </div> : mode === "range" ? <div className="atlas-range-fields">
      <div className="atlas-range-field">
        <span>From chapter</span>
        <CustomSelect ariaLabel="Story Atlas range start" value={currentFrom} options={options}
          onChange={(value) => {
            const nextOrdinal = chapters.find((chapter) => chapter.chapterId === value)?.ordinal ?? fromOrdinal;
            go("range", value, nextOrdinal > throughOrdinal ? value : currentThrough);
          }} />
      </div>
      <div className="atlas-range-field">
        <span>To chapter</span>
        <CustomSelect ariaLabel="Story Atlas range end" value={currentThrough} options={options}
          onChange={(value) => {
            const nextOrdinal = chapters.find((chapter) => chapter.chapterId === value)?.ordinal ?? throughOrdinal;
            go("range", nextOrdinal < fromOrdinal ? value : currentFrom, value);
          }} />
      </div>
    </div> : <div className="atlas-all-story-selection">
      <strong>Entire imported story</strong>
      <span>Chapter {chapters[0]?.ordinal ?? 1} through chapter {chapters.at(-1)?.ordinal ?? 1}. Explicit spoiler confirmation is required before unreviewed metadata is loaded.</span>
    </div>}
  </div>;
}
