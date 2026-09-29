import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { ArrowTopRightOnSquareIcon, ExclamationTriangleIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { KIND_LABELS, type InlineLookupData } from "~/lib/atlas";
import { MetadataMarkdown } from "./MetadataMarkdown";

export function InlineLookup({ data, novelId }: { data: InlineLookupData | null; novelId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const results = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.entries.filter((entry) => !q || `${entry.label} ${entry.aliases.join(" ")} ${entry.description}`.toLowerCase().includes(q)).slice(0, 24);
  }, [data, query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const overlay = open ? <>
    <button className="inline-lookup__backdrop" type="button" aria-label="Close inline lookup" onClick={() => setOpen(false)} />
    <aside id="inline-lookup-panel" className="inline-lookup" role="dialog" aria-modal="true" aria-labelledby="inline-lookup-title">
      <header className="inline-lookup__header">
        <div><p className="eyebrow">Inline lookup</p><h2 id="inline-lookup-title">Context without leaving the chapter</h2></div>
        <button ref={closeRef} type="button" aria-label="Close lookup" onClick={() => setOpen(false)}><XMarkIcon aria-hidden="true" /></button>
      </header>
      <div className="inline-lookup__body">
        {data ? <>
          {data.coverageLimited ? <div className="inline-lookup__warning" role="status"><ExclamationTriangleIcon aria-hidden="true" /><p><strong>You are reading chapter {data.through.ordinal}; reviewed lookup coverage currently ends at chapter {data.reviewedThrough.ordinal}.</strong><span>No facts from chapters {data.reviewedThrough.ordinal + 1}–{data.through.ordinal} are guessed or sent to this panel.</span></p></div> : <p className="inline-lookup__safety">Reviewed facts only · safe through chapter {data.through.ordinal}. Later knowledge is not sent to this page.</p>}
          <label className="inline-lookup__search"><MagnifyingGlassIcon aria-hidden="true" /><span className="sr-only">Search safe story facts</span><input type="search" maxLength={120} value={query} placeholder="Character, place, term, item..." onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="inline-lookup__results" role="list">
            {results.map((entry) => <article key={entry.id} role="listitem"><div><span>{KIND_LABELS[entry.kind]} · Ch. {entry.visibleFrom}</span><h3>{entry.label}</h3></div><MetadataMarkdown source={entry.description} novelId={novelId} variant="compact" />{entry.aliases.length ? <small>Also: {entry.aliases.join(", ")}</small> : null}<Link to={entry.source.href}><ArrowTopRightOnSquareIcon aria-hidden="true" />Review source</Link></article>)}
            {!results.length ? <div className="empty-inline">No reviewed fact matches this lookup.</div> : null}
          </div>
          <footer className="inline-lookup__footer">Knowledge v{data.version}. {data.coverageNote}</footer>
        </> : <div className="empty-state"><h2>No safe lookup coverage here yet</h2><p>No manually reviewed knowledge snapshot is available at or before this chapter, so the app does not infer story facts.</p></div>}
      </div>
    </aside>
  </> : null;

  return <>
    <button className="inline-lookup__trigger" type="button" aria-expanded={open} aria-controls="inline-lookup-panel" onClick={() => setOpen(true)}>
      <MagnifyingGlassIcon aria-hidden="true" /><span>Lookup</span>
    </button>
    {overlay && typeof document !== "undefined" ? createPortal(overlay, document.body) : null}
  </>;
}
