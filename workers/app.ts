import {
  createRequestHandler,
  RouterContextProvider,
  type ServerBuild,
} from "react-router";
import { cloudflareContext } from "../app/lib/cloudflare-context";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build") as Promise<ServerBuild>,
  import.meta.env.MODE,
);

export default {
  fetch(request, env, ctx) {
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
    return requestHandler(request, context);
  },
} satisfies ExportedHandler<Env>;
