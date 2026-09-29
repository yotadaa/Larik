import { createContext, type RouterContextProvider } from "react-router";
import { createDurablePasswordKdf } from "./auth-kdf.server.ts";

export interface CloudflareRequestContext {
  readonly env: Env;
  readonly ctx: ExecutionContext;
}

export const cloudflareContext = createContext<CloudflareRequestContext>();

export function getDb(context: Readonly<RouterContextProvider>) {
  return context.get(cloudflareContext).env.DB;
}

export function getPasswordKdf(context: Readonly<RouterContextProvider>) {
  const env = context.get(cloudflareContext).env as Env & { AUTH_KDF?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
  } };
  return createDurablePasswordKdf(env.AUTH_KDF);
}
