import { useMemo, useState } from "react";
import { Link } from "react-router";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { CustomSelect } from "./CustomSelect";
import { MetadataMarkdown } from "./MetadataMarkdown";
import { atlasActiveEdgesInWindow, KIND_LABELS, atlasKindFromMetadata, type AtlasCharacteristic, type AtlasData, type AtlasKind } from "~/lib/atlas";
import { hrefChapter } from "~/lib/params";

function evidenceChapterIds(value: string) {
  const ids: string[] = [];
  for (const match of value.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
    let target = match[1].trim().replace(/^recaps\//, "").replace(/^chapters\//, "");
    if (!/^\d{3}[-_]/.test(target)) continue;
    if (!target.endsWith(".md")) target += ".md";
    if (!ids.includes(target)) ids.push(target);
  }
  return ids;
}

function profileSearchText(profile: AtlasCharacteristic) {
  return [
    profile.canonicalName,
    profile.entityId,
    profile.entityType,
    profile.physicalForm,
    profile.temperamentOrProperties,
    profile.abilitiesOrRole,
    profile.relationshipsStatus,
    profile.characteristicAsOf,
    profile.scope,
  ].join(" ").toLowerCase();
}

function ProfileField({ label, value, novelId }: { label: string; value: string; novelId: string }) {
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "tidak berlaku") return null;
  return <section className="atlas-profile__field"><h3>{label}</h3><MetadataMarkdown source={normalized} novelId={novelId} variant="compact" /></section>;
}

export function AtlasProfiles({ atlas }: { atlas: AtlasData }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AtlasKind | "all">("all");
  const detailed = atlas.characteristics.filter((profile) => profile.profileKind === "detailed");
  const kinds = useMemo(() => Array.from(new Set(atlas.characteristics.map((profile) => atlasKindFromMetadata(profile.entityType)))).sort(), [atlas.characteristics]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => atlas.characteristics.filter((profile) => {
    const profileKind = atlasKindFromMetadata(profile.entityType);
    return (kind === "all" || profileKind === kind) && (!q || profileSearchText(profile).includes(q));
  }), [atlas.characteristics, kind, q]);
  const [selectedId, setSelectedId] = useState(() => detailed[0]?.entityId ?? atlas.characteristics[0]?.entityId ?? "");
  const selected = filtered.find((profile) => profile.entityId === selectedId) ?? filtered[0];
  const nodes = useMemo(() => new Map(atlas.nodes.map((node) => [node.id, node])), [atlas.nodes]);
  const activeEdges = useMemo(() => atlasActiveEdgesInWindow(atlas), [atlas]);

  if (!atlas.characteristics.length) {
    return <section className="atlas-visual-card empty-state"><h2>No characteristic profiles are safe at this boundary</h2><p>Detailed profiles are cumulative snapshots. They are withheld until the chapter boundary used to compile them is reached, rather than leaking later biography at an entity&apos;s first appearance.</p></section>;
  }

  const facts = selected ? atlas.facts.filter((fact) => fact.subjectId === selected.entityId) : [];
  const states = selected ? atlas.states.filter((state) => state.entityId === selected.entityId) : [];
  const relations = selected ? activeEdges.filter((edge) => edge.source === selected.entityId || edge.target === selected.entityId) : [];
  const evidenceIds = selected ? evidenceChapterIds(selected.evidence) : [];
  const node = selected ? nodes.get(selected.entityId) : undefined;

  return <section className="atlas-visual-card atlas-profiles" aria-labelledby="atlas-profiles-title">
    <div className="atlas-visual-heading">
      <div><p className="eyebrow">Entity profiles · characteristics.md</p><h2 id="atlas-profiles-title">Readable profiles without flattening story history</h2></div>
      <p>Characteristics are cumulative editorial snapshots, so they are displayed separately from time-varying states. A detailed profile appears only when its complete source boundary is safe.</p>
    </div>

    <div className="atlas-profile__toolbar">
      <label className="atlas-search"><MagnifyingGlassIcon aria-hidden="true" /><span className="sr-only">Search profiles</span><input type="search" maxLength={120} placeholder="Search name, role, ability, property..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <CustomSelect ariaLabel="Profile entity type" value={kind} onChange={(value) => setKind(value as AtlasKind | "all")} options={[{ value: "all", label: "All entity types" }, ...kinds.map((value) => ({ value, label: KIND_LABELS[value] }))]} />
    </div>

    <div className="atlas-profile__status"><span>{filtered.length} profile record(s)</span><span>{detailed.length} detailed · {atlas.characteristics.length - detailed.length} registry-only at this boundary</span></div>

    {!filtered.length || !selected ? <div className="empty-state"><h2>No profile matches this filter</h2><p>Try another entity type or search phrase.</p></div> : <div className="atlas-profile__layout">
      <nav className="atlas-profile__list" aria-label="Entity profiles">
        {filtered.map((profile) => {
          const profileKind = atlasKindFromMetadata(profile.entityType);
          return <button key={`${profile.entityId}:${profile.profileKind}`} type="button" className={selected.entityId === profile.entityId ? "is-active" : ""} onClick={() => setSelectedId(profile.entityId)}>
            <span>{KIND_LABELS[profileKind]}</span><strong>{profile.canonicalName}</strong><small>{profile.profileKind === "detailed" ? `snapshot through Ch. ${profile.profileThrough ?? "?"}` : `registry · first seen Ch. ${profile.firstSeen ?? "?"}`}</small>
          </button>;
        })}
      </nav>

      <article className="atlas-profile__detail">
        <header>
          <div><p className="eyebrow">{KIND_LABELS[atlasKindFromMetadata(selected.entityType)]} · first seen Ch. {selected.firstSeen ?? "?"}</p><h2>{selected.canonicalName}</h2>{node?.aliases.length ? <p className="atlas-aliases">Revealed aliases: {node.aliases.join(", ")}</p> : null}</div>
          <div className="atlas-profile__badges"><span className={`atlas-data-badge${selected.reviewed ? " is-reviewed" : ""}`}>{selected.reviewed ? "Reviewed boundary" : "Metadata boundary"}</span><span className="atlas-data-badge">{selected.profileKind === "detailed" ? `Through Ch. ${selected.profileThrough ?? "?"}` : "Registry only"}</span></div>
        </header>

        {selected.profileKind === "detailed" ? <>
          <div className="atlas-profile__fields">
            <ProfileField label="Physical form" value={selected.physicalForm} novelId={atlas.novelId} />
            <ProfileField label="Temperament / properties" value={selected.temperamentOrProperties} novelId={atlas.novelId} />
            <ProfileField label="Abilities / role" value={selected.abilitiesOrRole} novelId={atlas.novelId} />
            <ProfileField label="Relationships / status" value={selected.relationshipsStatus} novelId={atlas.novelId} />
          </div>
          <ProfileField label={`Snapshot through chapter ${selected.profileThrough ?? "?"}`} value={selected.characteristicAsOf} novelId={atlas.novelId} />
        </> : <div className="atlas-profile__registry"><strong>Profile not yet curated inside this snapshot.</strong><MetadataMarkdown source={selected.scope || "The registry records this entity, but no cumulative characteristic profile is available at this boundary."} novelId={atlas.novelId} variant="compact" /></div>}

        <div className="atlas-profile__structured-summary" aria-label="Related structured records in selected Atlas window">
          <div><strong>{relations.length}</strong><span>relationships</span></div><div><strong>{states.length}</strong><span>states</span></div><div><strong>{facts.length}</strong><span>facts</span></div>
        </div>

        {evidenceIds.length ? <section className="atlas-profile__evidence"><h3>Profile evidence</h3><div>{evidenceIds.map((chapterId) => <Link key={chapterId} to={hrefChapter(atlas.novelId, chapterId)}>Ch. {Number.parseInt(chapterId, 10)}</Link>)}</div></section> : selected.evidence ? <section className="atlas-profile__evidence"><h3>Profile evidence</h3><MetadataMarkdown source={selected.evidence} novelId={atlas.novelId} variant="compact" /></section> : null}
      </article>
    </div>}
  </section>;
}
