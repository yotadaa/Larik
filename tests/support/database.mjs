import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function createDatabase({ corpus = false } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(fs.readFileSync(new URL(corpus ? "../../scripts/content-schema.sql" : "../../scripts/local-d1.sql", import.meta.url), "utf8"));
  sqlite.exec(fs.readFileSync(new URL("../../migrations/0001_reader_accounts.sql", import.meta.url), "utf8"));
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      return {
        bind(...input) { values = input; return this; },
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values) }; },
      };
    },
  };
  return { db, sqlite };
}
