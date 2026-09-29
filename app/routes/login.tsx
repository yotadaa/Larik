import { Form, Link, useNavigation } from "react-router";
import { ArrowRightIcon, EnvelopeIcon, KeyIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import type { Route } from "./+types/login";
import { getDb, getPasswordKdf } from "~/lib/cloudflare-context";
import { getUser, loginAction } from "~/lib/auth.server";
import { redirectTo, safeReturnTo } from "~/lib/http.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  try {
    const user = await getUser(getDb(context), request);
    if (user) throw redirectTo(returnTo);
  } catch (error) {
    if (error instanceof Response) throw error;
    const requestId = request.headers.get("CF-Ray") ?? crypto.randomUUID();
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "auth.login.loader.failure", requestId, message }));
  }
  return { returnTo };
}
export async function action({ request, context }: Route.ActionArgs) {
  const requestId = request.headers.get("CF-Ray") ?? crypto.randomUUID();
  try {
    return await loginAction(getDb(context), request, getPasswordKdf(context));
  } catch (error) {
    if (error instanceof Response) throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "auth.login.failure", requestId, message }));
    return Response.json(
      { error: "Sign-in service is temporarily unavailable. Please try again. Reference: " + requestId },
      { status: 503, headers: { "Cache-Control": "private, no-store", "X-Auth-Error-Id": requestId } },
    );
  }
}
export const meta = () => [{ title: "Sign in — The Reading Room" }, { name: "robots", content: "noindex" }];

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state === "submitting";
  const error = (actionData as { error?: string } | undefined)?.error;
  return <div className="page-shell auth-page">
    <section className="auth-card">
      <p className="eyebrow">Your reading, remembered</p>
      <h1>Welcome back.</h1>
      <p className="auth-lede">Sign in with the email and password you registered. Bookmarks and reading progress stay attached to this account.</p>
      <aside className="identity-notice" role="note">
        <ShieldCheckIcon aria-hidden="true" />
        <div><strong>Password-protected account</strong><p>Email ownership is not yet verified by a mail link. The password protects the account; do not reuse a password from another service.</p></div>
      </aside>
      <Form method="post" className="auth-form" aria-label="Account sign in">
        <input type="hidden" name="returnTo" value={loaderData.returnTo} />
        <label htmlFor="email">Email address</label>
        <div className="email-input"><EnvelopeIcon aria-hidden="true" /><input id="email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={254} placeholder="reader@example.com" required aria-describedby={error ? "login-error" : undefined} aria-invalid={Boolean(error)} /></div>
        <label htmlFor="password">Password</label>
        <div className="email-input"><KeyIcon aria-hidden="true" /><input id="password" name="password" type="password" autoComplete="current-password" minLength={12} maxLength={128} required aria-describedby={error ? "login-error" : undefined} aria-invalid={Boolean(error)} /></div>
        {error ? <p id="login-error" className="form-error" role="alert">{error}</p> : null}
        <button className="button button--primary" type="submit" disabled={pending}><span>{pending ? "Signing in..." : "Sign in"}</span><ArrowRightIcon aria-hidden="true" /></button>
      </Form>
      <p className="auth-switch">New here? <Link to={`/register?returnTo=${encodeURIComponent(loaderData.returnTo)}`}>Create an account</Link></p>
      <Link className="auth-back" to="/library">Continue reading without an account</Link>
    </section>
    <aside className="auth-aside" aria-label="Account features"><span className="auth-folio">01 / YOUR SHELF</span><h2>Good stories.<br />Right where you left them.</h2><p>One account for bookmarks, reading status, and your last reading position. Public story content remains readable without signing in.</p><div className="folio-rule" /></aside>
  </div>;
}
