import { useEffect, useMemo, useState } from "react";
import { AdjustmentsHorizontalIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

const STORAGE_KEY = "reading-room:prefs:v1";

type Theme = "paper" | "sepia" | "night";
type Font = "serif" | "sans" | "book";

type Prefs = {
  theme: Theme;
  font: Font;
  size: number;
  leading: number;
  width: number;
};

const defaults: Prefs = {
  theme: "paper",
  font: "serif",
  size: 19,
  leading: 1.8,
  width: 68,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalize(input: Partial<Prefs>): Prefs {
  return {
    theme: input.theme === "sepia" || input.theme === "night" ? input.theme : "paper",
    font: input.font === "sans" || input.font === "book" ? input.font : "serif",
    size: clamp(Number(input.size) || defaults.size, 16, 28),
    leading: clamp(Number(input.leading) || defaults.leading, 1.45, 2.2),
    width: clamp(Number(input.width) || defaults.width, 52, 82),
  };
}

function apply(prefs: Prefs) {
  const root = document.documentElement;
  root.dataset.readerTheme = prefs.theme;
  root.dataset.readerFont = prefs.font;
  root.style.setProperty("--reader-size", `${prefs.size}px`);
  root.style.setProperty("--reader-leading", String(prefs.leading));
  root.style.setProperty("--reader-width", `${prefs.width}ch`);
}

export function ReaderControls() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(defaults);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? normalize(JSON.parse(stored)) : defaults;
      setPrefs(parsed);
      apply(parsed);
    } catch {
      apply(defaults);
    }
  }, []);

  useEffect(() => {
    apply(prefs);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* storage may be unavailable */ }
  }, [prefs]);

  const summary = useMemo(() => `${prefs.size}px · ${Math.round(prefs.leading * 100)}%`, [prefs]);

  return (
    <div className="reader-controls">
      <button className="reader-controls__trigger" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <AdjustmentsHorizontalIcon aria-hidden="true" />
        <span className="reader-controls__label">Reading style</span>
        <span className="reader-controls__summary">{summary}</span>
      </button>
      {open ? (
        <div className="reader-controls__panel" role="group" aria-label="Reading preferences">
          <div className="control-group">
            <span className="control-label">Theme</span>
            <div className="segmented">
              {(["paper", "sepia", "night"] as const).map((theme) => (
                <button key={theme} type="button" className={prefs.theme === theme ? "is-active" : ""} onClick={() => setPrefs((current) => ({ ...current, theme }))}>
                  {theme[0].toUpperCase() + theme.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <label className="control-group">
            <span className="control-label">Typeface</span>
            <select value={prefs.font} onChange={(event) => setPrefs((current) => ({ ...current, font: event.target.value as Font }))}>
              <option value="serif">Literary serif</option>
              <option value="book">Book serif</option>
              <option value="sans">Clean sans</option>
            </select>
          </label>
          <label className="control-group">
            <span className="control-label">Text size <strong>{prefs.size}px</strong></span>
            <input type="range" min="16" max="28" step="1" value={prefs.size} onChange={(event) => setPrefs((current) => ({ ...current, size: Number(event.target.value) }))} />
          </label>
          <label className="control-group">
            <span className="control-label">Line height <strong>{prefs.leading.toFixed(2)}</strong></span>
            <input type="range" min="1.45" max="2.2" step="0.05" value={prefs.leading} onChange={(event) => setPrefs((current) => ({ ...current, leading: Number(event.target.value) }))} />
          </label>
          <label className="control-group">
            <span className="control-label">Reading measure <strong>{prefs.width}ch</strong></span>
            <input type="range" min="52" max="82" step="2" value={prefs.width} onChange={(event) => setPrefs((current) => ({ ...current, width: Number(event.target.value) }))} />
          </label>
          <button type="button" className="panel-action" onClick={() => setPrefs(defaults)}>
            <ArrowPathIcon aria-hidden="true" />
            <span>Reset defaults</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
