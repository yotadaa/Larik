-- Additive migration. Does not alter, seed, or delete existing novel/translation tables.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS reader_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email_verified_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reader_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES reader_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reader_sessions_expiry ON reader_sessions(expires_at);
CREATE INDEX IF NOT EXISTS reader_sessions_user ON reader_sessions(user_id);
CREATE TABLE IF NOT EXISTS reader_bookmarks (
  user_id TEXT NOT NULL REFERENCES reader_users(id) ON DELETE CASCADE,
  novel_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, novel_id, chapter_id)
);
CREATE INDEX IF NOT EXISTS reader_bookmarks_recent ON reader_bookmarks(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS reader_login_limits (
  bucket_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK(attempts >= 1),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reader_login_limits_expiry ON reader_login_limits(expires_at);
