import {
  createRequestHandler,
  RouterContextProvider,
  type ServerBuild,
} from "react-router";
import { cleanupAuth } from "../app/lib/auth.server";
import { cloudflareContext } from "../app/lib/cloudflare-context";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build") as Promise<ServerBuild>,
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const isAsset =
      pathname.startsWith("/assets/") ||
      pathname.startsWith("/@id/") ||
      pathname.startsWith("/node_modules/") ||
      pathname.startsWith("/@react-router/") ||
      pathname.startsWith("/brand-mark.svg");
    if (isAsset) return env.ASSETS.fetch(request);

    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    const response = await requestHandler(request, context);
    const secured = new Response(response.body, response);
    // Root loader contains profile state. Never share personalized HTML/data via a cache.
    secured.headers.set("Cache-Control", "private, no-store");
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return secured;
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanupAuth(env.DB));
  },
} satisfies ExportedHandler<Env>;
