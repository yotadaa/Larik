import { useRef } from "react";
import { Form, Link } from "react-router";
import { FunnelIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { Route } from "./+types/library";
import { CustomSelect } from "~/components/CustomSelect";
import { EmptyState } from "~/components/EmptyState";
import { NovelCard } from "~/components/NovelCard";
import { Pagination } from "~/components/Pagination";
import { SearchForm } from "~/components/SearchForm";
import { getDb } from "~/lib/cloudflare-context";
import { listLanguages, listNovels } from "~/lib/repository";
import { readPositiveInt, readSearchParam } from "~/lib/params";

export const meta: Route.MetaFunction = () => [{ title: "Library — The Reading Room" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = readSearchParam(url.searchParams.get("q"));
  const lang = readSearchParam(url.searchParams.get("lang"), 24);
  const page = readPositiveInt(url.searchParams.get("page"));
  const db = getDb(context);
  const [languages, novels] = await Promise.all([listLanguages(db), listNovels(db, { q, lang, page, pageSize: 18 })]);
  return { q, lang, languages, novels };
}

export default function Library({ loaderData }: Route.ComponentProps) {
  const { q, lang, languages, novels } = loaderData;
  const filterRef = useRef<HTMLFormElement>(null);
  return <div className="page-shell library-page">
    <header className="page-intro"><p className="eyebrow">Library</p><h1>Find your next chapter.</h1><p>Search by title or novel ID, then narrow the shelf by language.</p></header>
    <div className="library-tools">
      <SearchForm q={q} placeholder="Search novels…" hidden={{ lang }} />
      <Form ref={filterRef} method="get" className="filter-form">
        {q ? <input type="hidden" name="q" value={q} /> : null}
        <span className="filter-form__icon" aria-hidden="true"><FunnelIcon /></span><span className="filter-form__label">Language</span>
        <CustomSelect id="lang" name="lang" ariaLabel="Language filter" defaultValue={lang} options={[{ value: "", label: "All languages" }, ...languages.map((item) => ({ value: item.lang, label: `${item.lang || "Unknown"} (${item.count})` }))]} onChange={() => requestAnimationFrame(() => filterRef.current?.requestSubmit())} />
        <noscript><button className="compact-button" type="submit"><FunnelIcon aria-hidden="true" /><span>Apply filter</span></button></noscript>
      </Form>
    </div>
    <div className="library-result-bar"><p><strong>{novels.total}</strong> novel{novels.total === 1 ? "" : "s"}{q ? <> matching “{q}”</> : null}{lang ? <> in <span className="mono">{lang}</span></> : null}</p>{q || lang ? <Link className="inline-action inline-action--quiet" to="/library"><XMarkIcon aria-hidden="true" /><span>Clear filters</span></Link> : null}</div>
    {novels.items.length ? <><div className="novel-grid novel-grid--library">{novels.items.map((novel, index) => <NovelCard novel={novel} index={(novels.page - 1) * novels.pageSize + index} key={`${novel.lang}-${novel.novelId}`} />)}</div><Pagination page={novels.page} totalPages={novels.totalPages} /></> : <EmptyState title="No novels found" detail={q || lang ? "Try a broader search or clear the language filter." : "The D1 novel table has no visible rows yet."} />}
  </div>;
}
