import {
  isRouteErrorResponse,
  Form,
  Links,
  Link,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "react-router";
import {
  ArrowRightIcon,
  BookOpenIcon,
  HomeIcon,
  InformationCircleIcon,
  BookmarkIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";
import type { Route } from "./+types/root";
import { NavigationStatus } from "~/components/NavigationStatus";
import { getDb } from "~/lib/cloudflare-context";
import { getUser } from "~/lib/auth.server";
import { BRAND_BYLINE, BRAND_DESCRIPTION, BRAND_NAME, BRAND_SHORT_NAME, brandedTitle } from "~/lib/brand";
import "./styles.css";

export async function loader({ request, context }: Route.LoaderArgs) {
  try {
    return { user: await getUser(getDb(context), request) };
  } catch (error) {
    const requestId = request.headers.get("CF-Ray") ?? crypto.randomUUID();
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "auth.session.lookup.failure", requestId, message }));
    // Public reading must remain available even if the auth/session schema is temporarily unavailable.
    // Protected actions still call requireUser and therefore fail closed.
    return { user: null };
  }
}

export const meta: Route.MetaFunction = () => [
  { title: brandedTitle("Digital Novel Library") },
  {
    name: "description",
    content: BRAND_DESCRIPTION,
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/brand-mark.svg" type="image/svg+xml" />
        <Meta />
        <Links />
      </head>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <>
      <NavigationStatus />
      <header className="site-header">
        <div className="site-header__inner">
          <Link className="brand" to="/" aria-label={`${BRAND_NAME} home`}>
            <img className="brand__logo" src="/brand-mark.svg" alt="" width="42" height="42" />
            <span>
              <strong>{BRAND_SHORT_NAME}</strong>
              <small>{BRAND_BYLINE}</small>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Primary navigation">
            <Link to="/library"><BookOpenIcon aria-hidden="true" /><span>Library</span></Link>
            <Link to="/bookmarks"><BookmarkIcon aria-hidden="true" /><span>Bookmarks</span></Link>
            <a className="nav-about" href="#about"><InformationCircleIcon aria-hidden="true" /><span>About</span></a>
            {user ? <details className="account-menu"><summary><UserCircleIcon aria-hidden="true" /><span>Account</span></summary><div className="account-menu__panel"><strong>{user.email}</strong><small>Password protected · email delivery not yet verified</small><Form method="post" action="/logout"><button type="submit"><ArrowRightOnRectangleIcon aria-hidden="true" /><span>Sign out</span></button></Form></div></details> : <Link to="/login"><UserCircleIcon aria-hidden="true" /><span>Sign in</span></Link>}
          </nav>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className="site-footer" id="about">
        <div className="site-footer__inner">
          <div className="footer-brand">
            <img src="/brand-mark.svg" alt="" width="40" height="40" />
            <div>
              <p className="eyebrow">{BRAND_NAME}</p>
              <p>A focused interface for long-form reading. Data comes directly from the local Larik SQLite database.</p>
            </div>
          </div>
          <div className="footer-note">
            <span>React Router</span>
            <span>Node.js</span>
            <span>Local SQLite</span>
          </div>
        </div>
      </footer>
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let title = "Something went wrong";
  let detail = "The page could not be loaded.";
  let status = 500;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    title = error.status === 404 ? "Page not found" : error.status === 400 ? "Invalid request" : "Request failed";
    detail = typeof error.data === "string" ? error.data : error.statusText || detail;
  } else if (error instanceof Error) {
    detail = error.message.includes("SQLite") || error.message.includes("database")
      ? "The database could not be reached. This application does not fall back to bundled Markdown."
      : "An unexpected error occurred. Please try again.";
  }

  return (
    <div className="error-page page-shell">
      <p className="eyebrow">Error {status}</p>
      <h1>{title}</h1>
      <p>{detail}</p>
      <div className="button-row">
        <Link className="button" to="/">
          <span className="button__icon"><HomeIcon aria-hidden="true" /></span>
          <span>Return home</span>
        </Link>
        <Link className="button button--ghost" to="/library">
          <span className="button__icon"><BookOpenIcon aria-hidden="true" /></span>
          <span>Open library</span>
          <ArrowRightIcon className="button__arrow" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
