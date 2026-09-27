import type { Route } from "./+types/reader-state";
import { getDb } from "~/lib/cloudflare-context";
import { readerStateAction } from "~/lib/reader-state.server";

export async function action({ request, context }: Route.ActionArgs) {
  return readerStateAction(getDb(context), request);
}
export async function loader() {
  throw new Response("Method not allowed.", { status: 405 });
}
export default function ReaderStateResource() { return null; }
