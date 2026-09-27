import { createContext, type RouterContextProvider } from "react-router";

export interface CloudflareRequestContext {
  readonly env: Env;
  readonly ctx: ExecutionContext;
}

export const cloudflareContext = createContext<CloudflareRequestContext>();

export function getDb(context: Readonly<RouterContextProvider>) {
  return context.get(cloudflareContext).env.DB;
}
