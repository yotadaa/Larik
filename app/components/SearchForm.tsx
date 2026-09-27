import { Form } from "react-router";
import { ArrowRightIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";

export function SearchForm({
  q,
  placeholder,
  hidden = {},
}: {
  q: string;
  placeholder: string;
  hidden?: Record<string, string>;
}) {
  return (
    <Form method="get" className="search-form" role="search">
      {Object.entries(hidden).map(([name, value]) => value ? <input key={name} type="hidden" name={name} value={value} /> : null)}
      <label className="sr-only" htmlFor="q">Search</label>
      <div className="search-field">
        <MagnifyingGlassIcon aria-hidden="true" />
        <input id="q" name="q" defaultValue={q} placeholder={placeholder} maxLength={120} />
      </div>
      <button className="search-submit" type="submit">
        <span>Search</span>
        <ArrowRightIcon aria-hidden="true" />
      </button>
    </Form>
  );
}
