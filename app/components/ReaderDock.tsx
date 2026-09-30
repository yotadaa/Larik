import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeftIcon, ArrowRightIcon, BookOpenIcon, ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { BookmarkButton } from "./BookmarkButton";
import { hrefChapter, hrefNovel } from "~/lib/params";
import type { ChapterNavigation } from "~/lib/repository";
import type { ReaderUser } from "~/lib/auth.server";

export function ReaderDock({ navigation, user, bookmarked }: {
  navigation: ChapterNavigation; user: ReaderUser | null; bookmarked: boolean;
}) {
  const { current, previous, next } = navigation;
  const [visible, setVisible] = useState(true);
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    setVisible(true);
    let lastY = window.scrollY;
    let accumulated = 0;
    let direction = 0;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY;
      lastY = y;
      if (nav.current?.contains(document.activeElement)) { setVisible(true); return; }
      if (y < 80 || document.documentElement.scrollHeight - window.innerHeight - y < 80) {
        setVisible(true); accumulated = 0; return;
      }
      const nextDirection = Math.sign(delta);
      if (nextDirection !== direction) accumulated = 0;
      direction = nextDirection;
      accumulated += delta;
      if (accumulated > 30) { setVisible(false); accumulated = 0; }
      if (accumulated < -12) { setVisible(true); accumulated = 0; }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [current.chapterId, current.novelId]);
  return <>
    <button type="button" className={`reader-dock-toggle${visible ? " is-open" : ""}`}
      aria-controls="reader-dock" aria-expanded={visible} onClick={() => setVisible((value) => !value)}>
      {visible ? <ChevronDownIcon aria-hidden="true" /> : <ChevronUpIcon aria-hidden="true" />}
      <span>{visible ? "Hide controls" : "Chapter controls"}</span>
    </button>
    <nav ref={nav} id="reader-dock" className={`reader-dock${visible ? " is-visible" : ""}`}
      aria-label="Quick chapter navigation" aria-hidden={!visible} inert={!visible} onFocusCapture={() => setVisible(true)}>
      {previous ? <Link className="dock-control" to={hrefChapter(current.novelId, previous.chapterId)} title={previous.title}>
        <ArrowLeftIcon aria-hidden="true" /><span>Previous</span>
      </Link> : <button className="dock-control" type="button" disabled aria-label="No previous chapter"><ArrowLeftIcon aria-hidden="true" /><span>Previous</span></button>}
      <Link className="dock-control" to={hrefNovel(current.novelId)} title="Novel and table of contents"><BookOpenIcon aria-hidden="true" /><span>Novel</span></Link>
      <BookmarkButton novelId={current.novelId} chapterId={current.chapterId} user={user} bookmarked={bookmarked} compact />
      {next ? <Link className="dock-control" to={hrefChapter(current.novelId, next.chapterId)} title={next.title}>
        <ArrowRightIcon aria-hidden="true" /><span>Next</span>
      </Link> : <button className="dock-control" type="button" disabled aria-label="No next chapter"><ArrowRightIcon aria-hidden="true" /><span>Next</span></button>}
    </nav>
  </>;
}
