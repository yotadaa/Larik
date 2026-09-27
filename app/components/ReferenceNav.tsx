import { Link } from "react-router";
import {
  ArrowPathIcon,
  BookOpenIcon,
  MapPinIcon,
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
      {items.map(([slug, label, Icon]) => (
        <Link key={slug} className={active === slug ? "is-active" : ""} to={hrefReference(novelId, slug)}>
          <Icon className="reference-nav__icon" aria-hidden="true" />
          <span>{label}</span>
          {counts ? <small>{counts[slug]}</small> : null}
        </Link>
      ))}
    </nav>
  );
}
