import { Link, useLocation } from "react-router";
import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

function pageHref(pathname: string, search: string, page: number) {
  const params = new URLSearchParams(search);
  params.set("page", String(page));
  return `${pathname}?${params.toString()}`;
}

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const location = useLocation();
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      {page > 1 ? (
        <Link className="pagination__button" to={pageHref(location.pathname, location.search, page - 1)}>
          <ArrowLeftIcon aria-hidden="true" />
          <span>Previous</span>
        </Link>
      ) : <span />}
      <span className="pagination__status">Page {page} of {totalPages}</span>
      {page < totalPages ? (
        <Link className="pagination__button pagination__button--next" to={pageHref(location.pathname, location.search, page + 1)}>
          <span>Next</span>
          <ArrowRightIcon aria-hidden="true" />
        </Link>
      ) : <span />}
    </nav>
  );
}
