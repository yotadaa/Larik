import { Form, Link } from "react-router";
import {
  ArrowRightIcon,
  BookOpenIcon,
  DocumentTextIcon,
  LanguageIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import type { Route } from "./+types/home";
import { NovelCard } from "~/components/NovelCard";
import { getDb } from "~/lib/cloudflare-context";
import { getCatalogStats, listLanguages, listNovels } from "~/lib/repository";
import { BRAND_NAME } from "~/lib/brand";

export const meta: Route.MetaFunction = () => [
  { title: `${BRAND_NAME} — Read quietly, anywhere` },
  { name: "description", content: "A calm novel reader powered directly by the local Larik SQLite database." },
];

export async function loader({ context }: Route.LoaderArgs) {
  const db = getDb(context);
  const [stats, languages, featured] = await Promise.all([
    getCatalogStats(db),
    listLanguages(db),
    listNovels(db, { page: 1, pageSize: 6 }),
  ]);
  return { stats, languages, featured: featured.items };
}

function languageLabel(code: string) {
  if (!code) return "Unknown";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { stats, languages, featured } = loaderData;
  return (
    <div className="home-page">
      <section className="landing-hero page-shell">
        <div className="landing-hero__copy">
          <p className="eyebrow">A quiet digital reading room</p>
          <h1>Stories deserve<br />room to breathe.</h1>
          <p className="lede">
            Browse translated novels, read long chapters without interface noise, and keep the story’s people, places, terms, and continuity close when you need them.
          </p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/library">
              <span className="button__icon"><BookOpenIcon aria-hidden="true" /></span>
              <span>Browse the library</span>
              <ArrowRightIcon className="button__arrow" aria-hidden="true" />
            </Link>
            {featured[0] ? (
              <Link className="button button--ghost" to={`/novels/${encodeURIComponent(featured[0].novelId)}`}>
                <span>Start with a novel</span>
                <ArrowRightIcon className="button__arrow" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>
        <div className="landing-hero__folio" aria-label="Library summary">
          <div className="folio-rule" />
          <p className="folio-kicker">Live collection</p>
          <div className="folio-stat">
            <span className="folio-stat__icon"><BookOpenIcon aria-hidden="true" /></span>
            <strong>{stats.novels}</strong><span>novels</span>
          </div>
          <div className="folio-stat">
            <span className="folio-stat__icon"><DocumentTextIcon aria-hidden="true" /></span>
            <strong>{stats.chapters}</strong><span>chapters</span>
          </div>
          <div className="folio-stat">
            <span className="folio-stat__icon"><LanguageIcon aria-hidden="true" /></span>
            <strong>{stats.languages}</strong><span>languages</span>
          </div>
          <p className="folio-note">Read directly from local SQLite. No bundled Markdown fallback.</p>
        </div>
      </section>

      <section className="discovery-strip">
        <div className="page-shell discovery-strip__inner">
          <div>
            <p className="eyebrow">Find a story</p>
            <h2>Search the shelves</h2>
          </div>
          <Form method="get" action="/library" className="hero-search" role="search">
            <label className="sr-only" htmlFor="hero-q">Search novels</label>
            <div className="search-field">
              <MagnifyingGlassIcon aria-hidden="true" />
              <input id="hero-q" name="q" placeholder="Title or novel ID" maxLength={120} />
            </div>
            <button className="search-submit" type="submit">
              <span>Search</span>
              <ArrowRightIcon aria-hidden="true" />
            </button>
          </Form>
        </div>
      </section>

      <section className="page-shell home-section">
        <div className="section-heading section-heading--split">
          <div>
            <p className="eyebrow">Languages</p>
            <h2>Read by collection</h2>
          </div>
          <p>Language is part of the catalog metadata, so each shelf stays easy to scan without inventing categories the database does not contain.</p>
        </div>
        {languages.length ? (
          <div className="language-shelf">
            {languages.map((item, index) => (
              <Link className="language-tile" key={`${item.lang}-${index}`} to={`/library?lang=${encodeURIComponent(item.lang)}`}>
                <span className="language-tile__top">
                  <span className="language-tile__index">{String(index + 1).padStart(2, "0")}</span>
                  <LanguageIcon aria-hidden="true" />
                </span>
                <strong>{languageLabel(item.lang)}</strong>
                <span className="language-tile__meta">
                  {item.count} novel{item.count === 1 ? "" : "s"}
                  <ArrowRightIcon aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        ) : <p className="muted">No language metadata is stored yet.</p>}
      </section>

      <section className="page-shell home-section">
        <div className="section-heading">
          <div><p className="eyebrow">Library</p><h2>On the shelves</h2></div>
          <Link className="inline-action" to="/library">
            <span>View all novels</span>
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </div>
        {featured.length ? (
          <div className="novel-grid">{featured.map((novel, index) => <NovelCard novel={novel} index={index} key={novel.novelId} />)}</div>
        ) : (
          <div className="empty-inline"><p>The library is currently empty.</p></div>
        )}
      </section>

      <section className="reading-manifesto">
        <div className="page-shell reading-manifesto__grid">
          <div><p className="eyebrow">Designed for long reading</p><h2>Less interface.<br />More narrative.</h2></div>
          <div className="manifesto-points">
            <article><span>01</span><h3>Readable by default</h3><p>A restrained column, adaptable type, and calm contrast before any customization.</p></article>
            <article><span>02</span><h3>Context on demand</h3><p>Characters, places, glossary, continuity, and QA stay outside the prose until you ask for them.</p></article>
            <article><span>03</span><h3>Native local data</h3><p>React Router loaders query the local SQLite database on the server—database access never runs in the browser.</p></article>
          </div>
        </div>
      </section>
    </div>
  );
}
