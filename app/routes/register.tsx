import { Form, Link, useNavigation } from "react-router";
import { ArrowRightIcon, EnvelopeIcon, KeyIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import type { Route } from "./+types/register";
import { getDb } from "~/lib/cloudflare-context";
import { getUser, registerAction } from "~/lib/auth.server";
import { redirectTo, safeReturnTo } from "~/lib/http.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  const user = await getUser(getDb(context), request);
  if (user) throw redirectTo(returnTo);
  return { returnTo };
}
export async function action({ request, context }: Route.ActionArgs) {
  return registerAction(getDb(context), request);
}
export const meta = () => [{ title: "Register — The Reading Room" }, { name: "robots", content: "noindex" }];

export default function Register({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state === "submitting";
  const error = (actionData as { error?: string } | undefined)?.error;
  return <div className="page-shell auth-page">
    <section className="auth-card">
      <p className="eyebrow">Create your reading account</p>
      <h1>Make the shelf yours.</h1>
      <p className="auth-lede">Register once with an email and password, then use those credentials to return to your saved reading state.</p>
      <aside className="identity-notice" role="note"><ShieldCheckIcon aria-hidden="true" /><div><strong>Prototype email profiles are no longer trusted.</strong><p>If this browser still holds an old prototype session, the same email can be upgraded while preserving its bookmarks. Otherwise legacy data cannot be claimed by email alone.</p></div></aside>
      <Form method="post" className="auth-form" aria-label="Create account">
        <input type="hidden" name="returnTo" value={loaderData.returnTo} />
        <label htmlFor="register-email">Email address</label>
        <div className="email-input"><EnvelopeIcon aria-hidden="true" /><input id="register-email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={254} placeholder="reader@example.com" required aria-invalid={Boolean(error)} /></div>
        <label htmlFor="register-password">Password</label>
        <div className="email-input"><KeyIcon aria-hidden="true" /><input id="register-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required aria-describedby="password-help" aria-invalid={Boolean(error)} /></div>
        <p id="password-help" className="field-help">Use 12–128 characters. Passwords are stored as salted PBKDF2-HMAC-SHA-256 hashes, never as plaintext.</p>
        <label htmlFor="register-confirm">Confirm password</label>
        <div className="email-input"><KeyIcon aria-hidden="true" /><input id="register-confirm" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required aria-invalid={Boolean(error)} /></div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="button button--primary" type="submit" disabled={pending}><span>{pending ? "Creating account..." : "Create account"}</span><ArrowRightIcon aria-hidden="true" /></button>
      </Form>
      <p className="auth-switch">Already registered? <Link to={`/login?returnTo=${encodeURIComponent(loaderData.returnTo)}`}>Sign in</Link></p>
      <Link className="auth-back" to="/library">Continue without an account</Link>
    </section>
    <aside className="auth-aside" aria-label="Registration notes"><span className="auth-folio">01 / IDENTITY</span><h2>A real account.<br />Still lightweight.</h2><p>Authentication uses your password. Email delivery and mailbox verification can be added later without reopening blind email sign-in.</p><div className="folio-rule" /></aside>
  </div>;
}
