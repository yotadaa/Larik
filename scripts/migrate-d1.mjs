#!/usr/bin/env node
/**
 * Remote-only D1 migrations, directly through Cloudflare's REST API.
 * No npm dependencies, Wrangler, local D1, or Worker deployment required.
 * Save as scripts/migrate-d1.mjs. Uses ../.env and ../migrations/*.sql.
 *
 * node scripts/migrate-d1.mjs --status  (default; read-only)
 * node scripts/migrate-d1.mjs --apply   (writes to the remote database)
 * node scripts/migrate-d1.mjs --verify (read-only reader-schema check)
 *
 * Requires a recent Node.js 22 release (project requirement: >=22.22.0).
 * API reference:
 * https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/
 */
import process from 'node:process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HISTORY_TABLE = 'd1_migrations';
const READER_MIGRATION = '0001_reader_accounts.sql';
const FEATURE_MIGRATION = '0002_verified_identity_progress_knowledge.sql';
const HISTORY_SQL = `CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);`;

const READER_COLUMNS = {
  reader_users: ['id', 'email', 'email_verified_at', 'created_at', 'password_hash', 'password_salt', 'password_iterations', 'registered_at'],
  reader_sessions: ['token_hash', 'user_id', 'created_at', 'expires_at', 'auth_method'],
  reader_bookmarks: ['user_id', 'novel_id', 'chapter_id', 'created_at'],
  reader_login_limits: ['bucket_key', 'attempts', 'expires_at'],
  reader_library_state: ['user_id', 'novel_id', 'status', 'last_chapter_id', 'progress_percent', 'progress_sync_count', 'resume_open_count', 'last_resumed_at', 'updated_at'],
  story_knowledge_versions: ['novel_id', 'version', 'status', 'coverage_note', 'published_at'],
  story_chapter_sequence: ['novel_id', 'version', 'chapter_id', 'ordinal', 'title'],
  story_entities: ['novel_id', 'version', 'entity_id', 'kind', 'label', 'first_visible_ordinal', 'reviewed'],
  story_relations: ['novel_id', 'version', 'relation_id', 'source_entity_id', 'target_entity_id', 'visible_from_ordinal', 'reviewed'],
  story_events: ['novel_id', 'version', 'event_id', 'chapter_ordinal', 'chapter_id', 'reviewed'],
};
const READER_INDEXES = [
  ['reader_sessions_expiry', 'reader_sessions'],
  ['reader_sessions_user', 'reader_sessions'],
  ['reader_bookmarks_recent', 'reader_bookmarks'],
  ['reader_login_limits_expiry', 'reader_login_limits'],
  ['reader_library_state_recent', 'reader_library_state'],
  ['story_knowledge_published', 'story_knowledge_versions'],
  ['story_entities_visibility', 'story_entities'],
  ['story_relations_visibility', 'story_relations'],
  ['story_events_visibility', 'story_events'],
];

export function readConfig(env) {
  const value = (key) => (env[key] ?? '').trim();
  if (value('DATABASE_PROVIDER') && value('DATABASE_PROVIDER').toUpperCase() !== 'D1') {
    throw new Error('DATABASE_PROVIDER must be D1.');
  }
  // CLOUDFLARE_ID is your custom name for the Cloudflare ACCOUNT ID.
  const accountId = value('CLOUDFLARE_ID') || value('CLOUDFLARE_ACCOUNT_ID');
  if (value('CLOUDFLARE_ID') && value('CLOUDFLARE_ACCOUNT_ID') &&
      value('CLOUDFLARE_ID') !== value('CLOUDFLARE_ACCOUNT_ID')) {
    throw new Error('CLOUDFLARE_ID and CLOUDFLARE_ACCOUNT_ID disagree. Use the same account ID.');
  }
  const databaseId = value('DATABASE_ID');
  const databaseName = value('DATABASE_NAME');
  const token = value('CLOUDFLARE_API_TOKEN');
  if (!accountId || !databaseId || !databaseName || !token) {
    throw new Error('Fill CLOUDFLARE_ID, CLOUDFLARE_API_TOKEN, DATABASE_ID, and DATABASE_NAME in .env.');
  }
  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new Error('CLOUDFLARE_ID must be your 32-character Cloudflare ACCOUNT ID, not a user/zone ID or token.');
  }
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId)) {
    throw new Error('DATABASE_ID must be the D1 database UUID, matching the intended DB binding.');
  }
  if (/\s/.test(token)) {
    throw new Error('CLOUDFLARE_API_TOKEN must contain only the token, without a Bearer prefix or whitespace.');
  }
  return { accountId, databaseId, databaseName, token };
}

export function createD1Client(config, fetchImpl = globalThis.fetch) {
  const base = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}`;
  const redact = (text) => String(text).split(config.token).join('[REDACTED]');

  async function request(path = '', body) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(60_000),
        redirect: 'error',
      });
    } catch {
      // A timeout does not prove that a write failed; never blindly retry it.
      throw new Error('D1 request failed or timed out. It was NOT retried. Check connectivity and run --status before retrying an apply.');
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`D1 returned an unreadable response (HTTP ${response.status}). Run --status before retrying an apply.`);
    }
    if (!response.ok || data?.success !== true || data.errors?.length) {
      const details = (data?.errors ?? []).map((e) => `${e.code ?? 'D1'}: ${e.message ?? 'API error'}`).join('; ');
      const hint = response.status === 401 || response.status === 403
        ? ' Check the account ID and an API token with D1 Write permission for that account.'
        : response.status === 429 ? ' Rate limited; no request was automatically retried.' : '';
      throw new Error(redact(`D1 API error (HTTP ${response.status}): ${details || 'unsuccessful API response'}.${hint}`));
    }
    return data.result;
  }

  return {
    info: () => request(),
    async query(sql, params = []) {
      const result = await request('/query', { sql, params });
      if (!Array.isArray(result) || !result.length) {
        throw new Error('D1 returned no query results. Run --status before retrying an apply.');
      }
      for (const item of result) {
        if (item.success !== true || item.error) {
          throw new Error(redact(`D1 SQL failed: ${item.error || 'unsuccessful statement result'}`));
        }
      }
      return result.flatMap((item) => item.results ?? []);
    },
  };
}

// File names are escaped as SQL literals. Do not split SQL files on semicolons:
// string literals, comments, and trigger bodies may themselves contain them.
export function migrationBatch(name, sql) {
  const literal = `'${name.replaceAll("'", "''")}'`;
  // The newline also ends a possible trailing -- comment in the source file.
  // Plain INSERT (not OR IGNORE) avoids silently accepting a concurrent apply.
  return `${sql}\n;\nINSERT INTO ${HISTORY_TABLE} (name) VALUES (${literal});\n`;
}

export async function verifyReaderSchema(client, log = console.log) {
  const missing = [];
  for (const [table, expected] of Object.entries(READER_COLUMNS)) {
    const columns = await client.query(`SELECT name FROM pragma_table_info('${table}')`);
    const actual = new Set(columns.map((row) => row.name));
    for (const column of expected) {
      if (!actual.has(column)) missing.push(`${table}.${column}`);
    }
  }
  const indexes = await client.query("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index'");
  for (const [name, table] of READER_INDEXES) {
    if (!indexes.some((row) => row.name === name && row.tbl_name === table)) missing.push(`index ${name}`);
  }
  if (missing.length) throw new Error(`Reader schema incomplete: ${missing.join(', ')}.`);
  const fts = await client.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'story_chapter_fts'");
  if (!fts.length) throw new Error('Reader schema incomplete: story_chapter_fts is missing.');
  log('Verified: password auth, reader state, spoiler-safe knowledge tables, indexes, and chapter FTS.');
}

export async function run({
  argv = process.argv.slice(2),
  env = process.env,
  root = PROJECT_ROOT,
  fetchImpl = globalThis.fetch,
  log = console.log,
} = {}) {
  const allowed = new Set(['--status', '--dry-run', '--apply', '--verify', '--help']);
  if (argv.length > 1 || argv.some((arg) => !allowed.has(arg))) {
    throw new Error('Use exactly one of --status, --dry-run, --apply, --verify, or --help. Default: --status.');
  }
  const mode = argv[0] ?? '--status';
  if (mode === '--help') {
    log('Remote D1: node scripts/migrate-d1.mjs [--status | --apply | --verify]');
    log('--status / --dry-run: read-only pending-migration preview (also the default).');
    log('--apply: apply every pending migrations/*.sql file to remote D1.');
    log('--verify: read-only checks for password auth, reader state, knowledge and FTS schema.');
    log('Reads project-root .env automatically. No Wrangler or local database.');
    return { applied: [], pending: [] };
  }

  const config = readConfig(env);
  const client = createD1Client(config, fetchImpl);
  const info = await client.info();
  if (info?.uuid?.toLowerCase() !== config.databaseId.toLowerCase() || info?.name !== config.databaseName) {
    throw new Error(`Database mismatch: expected ${config.databaseName} (${config.databaseId}), received ${info?.name ?? 'unknown'} (${info?.uuid ?? 'unknown'}). No SQL was sent.`);
  }
  log(`REMOTE D1: ${info.name} (${info.uuid})`);
  log(`Account: ${config.accountId}`);
  if (mode === '--verify') {
    await verifyReaderSchema(client, log);
    return { applied: [], pending: [] };
  }

  const dir = resolve(root, 'migrations');
  const entries = await readdir(dir, { withFileTypes: true });
  const names = entries.filter((e) => e.isFile() && e.name.endsWith('.sql')).map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (!names.length) throw new Error(`No .sql migration files found in ${dir}.`);
  // Load every file before sending any write, so a later unreadable file fails early.
  const files = await Promise.all(names.map(async (name) => {
    const sql = (await readFile(resolve(dir, name), 'utf8')).replace(/^\uFEFF/, '');
    if (!sql.trim()) throw new Error(`Migration is empty: ${name}.`);
    return { name, sql };
  }));
  const tables = await client.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [HISTORY_TABLE]);
  const history = tables.length ? await client.query(`SELECT name FROM ${HISTORY_TABLE}`) : [];
  const applied = new Set(history.map((row) => row.name));
  const pending = files.filter((file) => !applied.has(file.name));
  for (const file of files) log(`${applied.has(file.name) ? 'APPLIED' : 'PENDING'}  ${file.name}`);
  const unknown = history.filter((row) => !names.includes(row.name));
  if (unknown.length) log(`Note: ${unknown.length} recorded migration(s) are absent from this folder; their records will be left unchanged.`);

  if (mode !== '--apply') {
    log(`${pending.length} pending. Preview only; no database writes or SQL execution of migration files.`);
    log('Apply with: node scripts/migrate-d1.mjs --apply');
    return { applied: [], pending: pending.map((file) => file.name) };
  }

  const completed = [];
  if (pending.length) {
    log(`Applying ${pending.length} migration(s) to REMOTE D1. Run only one migrator at a time.`);
    await client.query(HISTORY_SQL);
    for (const file of pending) {
      log(`Applying ${file.name} ...`);
      try {
        // One request contains the complete migration and its history insert.
        // No separate per-statement requests and no client-side BEGIN/COMMIT.
        await client.query(migrationBatch(file.name, file.sql));
      } catch (error) {
        throw new Error(`Stopped at ${file.name}. ${completed.length} earlier migration(s) completed. ${error.message} Inspect --status before retrying; no write was automatically retried.`);
      }
      completed.push(file.name);
      log(`Applied ${file.name}`);
    }
  } else {
    log('No pending migrations; no migration writes performed.');
  }
  if (names.includes(READER_MIGRATION) && names.includes(FEATURE_MIGRATION)) {
    try {
      await verifyReaderSchema(client, log);
    } catch (error) {
      throw new Error(`Migration phase finished, but reader-schema verification failed. Applied migrations are NOT undone. ${error.message}`);
    }
  }
  log('Done.');
  return { applied: completed, pending: [] };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    if (process.argv[2] !== '--help') {
      if (typeof process.loadEnvFile !== 'function') {
        throw new Error('Use a recent Node.js 22 release; this script uses built-in .env support.');
      }
      try {
        process.loadEnvFile(resolve(PROJECT_ROOT, '.env'));
      } catch (error) {
        // CI may provide credentials through environment variables instead.
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await run();
  } catch (error) {
    const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
    const message = token ? String(error.message).split(token).join('[REDACTED]') : error.message;
    console.error(`Migration error: ${message}`);
    process.exitCode = 1;
  }
}
