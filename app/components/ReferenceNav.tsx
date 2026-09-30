import { Link } from "react-router";
import {
  ArrowPathIcon,
  ShareIcon,
  BookOpenIcon,
  MapPinIcon,
  IdentificationIcon,
  ShieldCheckIcon,
  TagIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { hrefReference } from "~/lib/params";
import type { ReferenceCounts } from "~/lib/repository";

const items = [
  ["characters", "Characters", UsersIcon],
  ["locations", "Places", MapPinIcon],
  ["terminology", "Terminology", TagIcon],
  ["glossary", "Glossary", BookOpenIcon],
  ["continuity", "Continuity", ArrowPathIcon],
  ["qa", "QA notes", ShieldCheckIcon],
] as const;

export function ReferenceNav({ novelId, active, counts }: { novelId: string; active?: string; counts?: ReferenceCounts }) {
  return (
    <nav className="reference-nav" aria-label="Story reference">
      <Link className={active === "atlas" ? "is-active" : ""} to={`/novels/${encodeURIComponent(novelId)}/atlas`} aria-current={active === "atlas" ? "page" : undefined}><ShareIcon className="reference-nav__icon" aria-hidden="true" /><span>Visual atlas</span></Link>
      <Link className={active === "profiles" ? "is-active" : ""} to={`/novels/${encodeURIComponent(novelId)}/atlas?view=profiles`} aria-current={active === "profiles" ? "page" : undefined}><IdentificationIcon className="reference-nav__icon" aria-hidden="true" /><span>Entity profiles</span></Link>
      {items.map(([slug, label, Icon]) => (
        <Link key={slug} className={active === slug ? "is-active" : ""} to={hrefReference(novelId, slug)}>
          <Icon className="reference-nav__icon" aria-hidden="true" />
          <span>{slug === "qa" ? "Editorial QA" : label}</span>
          {counts ? <small>{counts[slug]}</small> : null}
        </Link>
      ))}
    </nav>
  );
}
