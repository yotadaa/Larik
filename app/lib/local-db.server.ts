import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import type { D1DatabaseLike, D1StatementLike } from "./repository.ts";

const READER_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reader_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  password_iterations INTEGER,
  registered_at INTEGER
);

CREATE TABLE IF NOT EXISTS reader_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  auth_method TEXT NOT NULL DEFAULT 'password',
  FOREIGN KEY (user_id) REFERENCES reader_users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reader_sessions_user ON reader_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_reader_sessions_expiry ON reader_sessions(expires_at);

CREATE TABLE IF NOT EXISTS reader_login_limits (
  bucket_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reader_login_limits_expiry ON reader_login_limits(expires_at);

CREATE TABLE IF NOT EXISTS reader_bookmarks (
  user_id TEXT NOT NULL,
  novel_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, novel_id, chapter_id),
  FOREIGN KEY (user_id) REFERENCES reader_users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reader_bookmarks_user_created ON reader_bookmarks(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reader_library_state (
  user_id TEXT NOT NULL,
  novel_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'reading', 'paused', 'finished')),
  last_chapter_id TEXT NOT NULL DEFAULT '',
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  progress_sync_count INTEGER NOT NULL DEFAULT 0,
  resume_open_count INTEGER NOT NULL DEFAULT 0,
  last_resumed_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, novel_id),
  FOREIGN KEY (user_id) REFERENCES reader_users(id) ON DELETE CASCADE
);
`;

function toSqlValue(value: unknown): SQLInputValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (ArrayBuffer.isView(value)) return value as SQLInputValue;
  return String(value);
}

class LocalStatement implements D1StatementLike {
  private readonly statement: StatementSync;
  private readonly values: SQLInputValue[];

  constructor(statement: StatementSync, values: SQLInputValue[] = []) {
    this.statement = statement;
    this.values = values;
  }

  bind(...values: unknown[]): D1StatementLike {
    return new LocalStatement(this.statement, values.map(toSqlValue));
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    try {
      return { results: this.statement.all(...this.values) as T[] };
    } catch (error) {
      if (isNonReaderError(error)) {
        this.statement.run(...this.values);
        return { results: [] };
      }
      throw error;
    }
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    try {
      return (this.statement.get(...this.values) as T | undefined) ?? null;
    } catch (error) {
      if (isNonReaderError(error)) {
        this.statement.run(...this.values);
        return null;
      }
      throw error;
    }
  }
}

class LocalDatabase implements D1DatabaseLike {
  readonly raw: DatabaseSync;
  readonly filename: string;

  constructor(raw: DatabaseSync, filename: string) {
    this.raw = raw;
    this.filename = filename;
  }

  prepare(sql: string): D1StatementLike {
    return new LocalStatement(this.raw.prepare(sql));
  }
}

function isNonReaderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /does not return data|This statement does not return data/i.test(message);
}

let singleton: LocalDatabase | null = null;

function configuredDatabasePath() {
  const configured = process.env.DATABASE_PATH?.trim() || "storage/story.sqlite3";
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

function verifyTranslatorSchema(db: DatabaseSync, filename: string) {
  const required = [
    "chapters",
    "entities",
    "relationships",
    "terminology",
    "glossary",
    "arcs",
    "style_profiles",
    "translation_runs",
  ];
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
  const existing = new Set(rows.map((row) => row.name));
  const missing = required.filter((name) => !existing.has(name));
  if (missing.length) {
    throw new Error(
      `Local SQLite database at ${filename} is not a Larik translator database. Missing table(s): ${missing.join(", ")}. Run \`python main.py init-db\` in the translator project first, or set DATABASE_PATH to the correct story.sqlite3.`,
    );
  }
}

export function getLocalDatabase(): D1DatabaseLike {
  if (singleton) return singleton;
  const filename = configuredDatabasePath();
  if (!existsSync(filename)) {
    throw new Error(
      `Local SQLite database not found at ${filename}. Run \`python main.py init-db\` first or set DATABASE_PATH in .env.`,
    );
  }

  const raw = new DatabaseSync(filename);
  raw.exec("PRAGMA foreign_keys = ON;");
  raw.exec("PRAGMA busy_timeout = 5000;");
  verifyTranslatorSchema(raw, filename);
  raw.exec(READER_SCHEMA);
  singleton = new LocalDatabase(raw, filename);
  return singleton;
}

export function getLocalDatabasePath() {
  return configuredDatabasePath();
}
