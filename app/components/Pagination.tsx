import { Link, useLocation } from "react-router";
import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

function pageHref(pathname: string, search: string, page: number) {
  const params = new URLSearchParams(search);
  params.set("page", String(page));
  return `${pathname}?${params.toString()}`;
}

function visiblePages(page: number, totalPages: number) {
  const pages = new Set([1, totalPages]);
  for (let number = Math.max(1, page - 2); number <= Math.min(totalPages, page + 2); number++) pages.add(number);
  return [...pages].sort((a, b) => a - b);
}

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const location = useLocation();
  if (totalPages <= 1) return null;
  let previousPage = 0;
  const pages = visiblePages(page, totalPages);
  return (
    <nav className="pagination" aria-label="Pagination">
      {page > 1 ? (
        <Link className="pagination__button" to={pageHref(location.pathname, location.search, page - 1)}>
          <ArrowLeftIcon aria-hidden="true" />
          <span>Previous</span>
        </Link>
      ) : <span />}
      <div className="pagination__pages">
        {pages.map((number) => {
          const gap = previousPage > 0 && number - previousPage > 1;
          previousPage = number;
          return (
            <span className="pagination__page-group" key={number}>
              {gap ? <span className="pagination__ellipsis" aria-hidden="true">…</span> : null}
              {number === page ? (
                <span className="pagination__page is-current" aria-current="page">{number}</span>
              ) : (
                <Link className="pagination__page" to={pageHref(location.pathname, location.search, number)} aria-label={`Page ${number}`}>
                  {number}
                </Link>
              )}
            </span>
          );
        })}
      </div>
      {page < totalPages ? (
        <Link className="pagination__button pagination__button--next" to={pageHref(location.pathname, location.search, page + 1)}>
          <span>Next</span>
          <ArrowRightIcon aria-hidden="true" />
        </Link>
      ) : <span />}
    </nav>
  );
}
