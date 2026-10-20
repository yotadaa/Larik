import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";

export const SCENE_STORAGE_KEY = "larik-scene";

const SCENES = [
  { id: "fajar", label: "Fajar", hint: "Dawn · 04–06" },
  { id: "pagi", label: "Pagi", hint: "Morning · 06–10" },
  { id: "siang", label: "Siang", hint: "Midday · 10–15" },
  { id: "sore", label: "Sore", hint: "Afternoon · 15–17" },
  { id: "sunset", label: "Sunset", hint: "Golden hour · 17–19" },
  { id: "malam", label: "Malam", hint: "Night · 19–04" },
] as const;

type SceneId = (typeof SCENES)[number]["id"];
type Preference = SceneId | "auto";

const THEME_COLORS: Record<SceneId, string> = {
  fajar: "#8fa6e0",
  pagi: "#a6cff8",
  siang: "#5aa9f2",
  sore: "#86bde8",
  sunset: "#9a8fe0",
  malam: "#0b1430",
};

function sceneForNow(): SceneId {
  const h = new Date().getHours();
  if (h >= 4 && h < 6) return "fajar";
  if (h >= 6 && h < 10) return "pagi";
  if (h >= 10 && h < 15) return "siang";
  if (h >= 15 && h < 17) return "sore";
  if (h >= 17 && h < 19) return "sunset";
  return "malam";
}

function isPreference(value: string | null): value is Preference {
  return value === "auto" || SCENES.some((scene) => scene.id === value);
}

function applyScene(preference: Preference) {
  const scene = preference === "auto" ? sceneForNow() : preference;
  document.documentElement.dataset.scene = scene;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[scene]);
}

export function SceneSwitcher() {
  const [preference, setPreference] = useState<Preference>("pagi");
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Read the saved choice once on the client (the inline head script already painted it).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SCENE_STORAGE_KEY);
      if (isPreference(saved)) setPreference(saved);
    } catch {
      /* storage can be unavailable (private mode); keep the default */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyScene(preference);
    if (preference !== "auto") return;
    const timer = window.setInterval(() => applyScene("auto"), 60_000);
    return () => window.clearInterval(timer);
  }, [preference, ready]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: Preference) {
    setPreference(next);
    setOpen(false);
    try {
      localStorage.setItem(SCENE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="scene-switcher" ref={root}>
      <button
        type="button"
        className="scene-switcher__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change scene"
        title="Change scene"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="scene-dot scene-dot--current" aria-hidden="true" />
      </button>
      {open ? (
        <div className="scene-menu" role="menu" aria-label="Scene">
          <p className="scene-menu__title">Scene</p>
          {SCENES.map((scene) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={preference === scene.id}
              className="scene-menu__item"
              key={scene.id}
              onClick={() => choose(scene.id)}
            >
              <span className={`scene-dot scene-dot--${scene.id}`} aria-hidden="true" />
              <span className="scene-menu__label">{scene.label}<small>{scene.hint}</small></span>
              {preference === scene.id ? <CheckIcon aria-hidden="true" /> : <span />}
            </button>
          ))}
          <div className="scene-menu__sep" />
          <button
            type="button"
            role="menuitemradio"
            aria-checked={preference === "auto"}
            className="scene-menu__item"
            onClick={() => choose("auto")}
          >
            <span className="scene-dot scene-dot--auto" aria-hidden="true" />
            <span className="scene-menu__label">Auto<small>Follows the time of day</small></span>
            {preference === "auto" ? <CheckIcon aria-hidden="true" /> : <span />}
          </button>
        </div>
      ) : null}
    </div>
  );
}
