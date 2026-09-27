import { useEffect, useState } from "react";

export function ReadingProgress({ novelId, chapterId }: { novelId: string; chapterId: string }) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const key = `reading-room:progress:${novelId}`;
    const update = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const next = Math.max(0, Math.min(100, Math.round((window.scrollY / max) * 100)));
      setPercent(next);
      try {
        localStorage.setItem(key, JSON.stringify({ chapterId, percent: next, updatedAt: Date.now() }));
      } catch { /* storage may be unavailable */ }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [novelId, chapterId]);

  return <div className="reading-progress" aria-label={`Reading progress ${percent}%`}><span style={{ width: `${percent}%` }} /></div>;
}
