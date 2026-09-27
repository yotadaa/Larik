import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

const syncPoints = [0, 25, 50, 75, 90, 100];
const syncBucket = (percent: number) => [...syncPoints].reverse().find((point) => percent >= point) ?? 0;

export function ReadingProgress({
  novelId,
  chapterId,
  authenticated = false,
  storedPercent = -1,
  restoreStoredProgress = false,
}: {
  novelId: string;
  chapterId: string;
  authenticated?: boolean;
  storedPercent?: number;
  restoreStoredProgress?: boolean;
}) {
  const [percent, setPercent] = useState(0);
  const fetcher = useFetcher();
  const resumeFetcher = useFetcher();
  const lastSynced = useRef(storedPercent >= 0 ? syncBucket(storedPercent) : -1);

  useEffect(() => {
    lastSynced.current = storedPercent >= 0 ? syncBucket(storedPercent) : -1;
    if (restoreStoredProgress && authenticated && storedPercent >= 0) {
      if (storedPercent > 0) {
        const restore = () => {
          const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
          window.scrollTo({ top: Math.round(max * (storedPercent / 100)), behavior: "auto" });
        };
        requestAnimationFrame(() => requestAnimationFrame(restore));
      }
      resumeFetcher.submit(
        { intent: "resume-open", novelId, chapterId },
        { method: "post", action: "/reader-state" },
      );
    }

    const key = `reading-room:progress:${novelId}`;
    const update = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const next = Math.max(0, Math.min(100, Math.round((window.scrollY / max) * 100)));
      setPercent(next);
      try { localStorage.setItem(key, JSON.stringify({ chapterId, percent: next, updatedAt: Date.now() })); } catch { /* optional guest storage */ }
      if (!authenticated) return;
      const bucket = syncBucket(next);
      if (bucket <= lastSynced.current) return;
      lastSynced.current = bucket;
      fetcher.submit({ intent: "progress", novelId, chapterId, percent: String(bucket) }, { method: "post", action: "/reader-state" });
    };

    // A new chapter needs one cheap D1 write even before the reader scrolls, so resume can point here.
    if (authenticated && storedPercent < 0) {
      lastSynced.current = 0;
      fetcher.submit({ intent: "progress", novelId, chapterId, percent: "0" }, { method: "post", action: "/reader-state" });
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [novelId, chapterId, authenticated, storedPercent, restoreStoredProgress]);

  return <div className="reading-progress" aria-label={`Reading progress ${percent}%`}><span style={{ width: `${percent}%` }} /></div>;
}
