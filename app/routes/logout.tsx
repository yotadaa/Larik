import { Form, Link } from "react-router";
import type { Route } from "./+types/logout";
import { brandedTitle } from "~/lib/brand";
import { getDb } from "~/lib/cloudflare-context";
import { logoutAction } from "~/lib/auth.server";
export async function action({ request, context }: Route.ActionArgs) { return logoutAction(getDb(context), request); }
export const meta = () => [{ title: brandedTitle("Sign out") }, { name: "robots", content: "noindex" }];
export default function Logout() {
  return <section className="page-shell page-intro"><p className="eyebrow">Your account</p><h1>Sign out?</h1><p>Your saved bookmarks will remain on your profile.</p><div className="button-row"><Form method="post"><button className="button" type="submit">Sign out</button></Form><Link className="button button--ghost" to="/bookmarks">Keep reading</Link></div></section>;
}
