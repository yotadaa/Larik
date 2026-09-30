import type { RouterContextProvider } from "react-router";
import { directPasswordKdf } from "./auth.server.ts";
import { getLocalDatabase } from "./local-db.server.ts";

/**
 * Kept under the historical module name so the rest of the uploaded UI can stay unchanged.
 * The application now runs against the translator's local SQLite database.
 */
export function getDb(_context?: Readonly<RouterContextProvider>) {
  return getLocalDatabase();
}

export function getPasswordKdf(_context?: Readonly<RouterContextProvider>) {
  return directPasswordKdf;
}
