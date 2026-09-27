import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run, readConfig, createD1Client, migrationBatch } from '../scripts/migrate-d1.mjs';

const ENV = {
  DATABASE_NAME: 'novel',
  DATABASE_ID: '11111111-2222-4333-8444-555555555555',
  DATABASE_PROVIDER: 'D1',
  CLOUDFLARE_ID: 'a'.repeat(32),
  CLOUDFLARE_API_TOKEN: 'test-only-not-a-real-token',
};
const READER_SQL = await readFile(new URL('../migrations/0001_reader_accounts.sql', import.meta.url), 'utf8');
const FEATURE_SQL = await readFile(new URL('../migrations/0002_verified_identity_progress_knowledge.sql', import.meta.url), 'utf8');
const DEFAULT_FILES = {
  '0001_reader_accounts.sql': READER_SQL,
  '0002_verified_identity_progress_knowledge.sql': FEATURE_SQL,
};

const CONTENT_FIXTURE_SQL = `
CREATE TABLE "novel-content" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "novel-id" TEXT NOT NULL,
  "chapter-id" TEXT NOT NULL,
  "chapter-title" TEXT NOT NULL DEFAULT '',
  "content" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "novel-content" ("novel-id", "chapter-id", "chapter-title", "content")
VALUES ('a-regressors-tale-of-cultivation', '001-hari-pertama-regresor.md', 'Hari Pertama Sang Regresor', 'Seo Eun-hyun remembers the first day.');
`;

async function fixture(t, files = DEFAULT_FILES) {
  const root = await mkdtemp(join(tmpdir(), 'd1-rest-test-'));
  await mkdir(join(root, 'migrations'));
  for (const [name, sql] of Object.entries(files)) await writeFile(join(root, 'migrations', name), sql);
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(CONTENT_FIXTURE_SQL);
  const requests = [];
  const logs = [];
  // LOCAL HTTP API test double: no network calls. SQLite executes the real migration SQL.
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.headers.Authorization, `Bearer ${ENV.CLOUDFLARE_API_TOKEN}`);
    assert.equal(options.redirect, 'error');
    assert.match(url, /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\//);
    if (options.method === 'GET') {
      return Response.json({ success: true, errors: [], result: { uuid: ENV.DATABASE_ID, name: ENV.DATABASE_NAME } });
    }
    assert.ok(url.endsWith('/query'));
    const { sql, params } = JSON.parse(options.body);
    db.exec('BEGIN');
    try {
      let results = [];
      if (/^\s*SELECT\b/i.test(sql)) results = db.prepare(sql).all(...(params ?? []));
      else db.exec(sql);
      db.exec('COMMIT');
      return Response.json({ success: true, errors: [], result: [{ success: true, results }] });
    } catch (error) {
      db.exec('ROLLBACK');
      return Response.json({ success: false, errors: [{ code: 7500, message: error.message }], result: [] });
    }
  };
  t.after(async () => { db.close(); await rm(root, { recursive: true, force: true }); });
  return {
    db, root, requests, logs, fetchImpl,
    run: (argv = [], extra = {}) => run({ argv, env: ENV, root, fetchImpl, log: (line) => logs.push(line), ...extra }),
  };
}

const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name);
const schema = (db) => db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name").all();

test('default/status is read-only and reports both project migrations', async (t) => {
  const f = await fixture(t);
  const before = schema(f.db);
  const result = await f.run();
  assert.deepEqual(result.pending, ['0001_reader_accounts.sql', '0002_verified_identity_progress_knowledge.sql']);
  assert.deepEqual(schema(f.db), before);
  assert.ok(!tables(f.db).includes('d1_migrations'));
  assert.ok(f.logs.some((line) => line.includes('Preview only')));
});

test('--dry-run is also read-only', async (t) => {
  const f = await fixture(t);
  const before = schema(f.db);
  await f.run(['--dry-run']);
  assert.deepEqual(schema(f.db), before);
});

test('apply creates password/progress/knowledge schema, FTS, and migration history without changing content', async (t) => {
  const f = await fixture(t);
  f.db.exec("CREATE TABLE novel (id TEXT PRIMARY KEY, content TEXT); INSERT INTO novel VALUES ('n1', 'keep me');");
  const result = await f.run(['--apply']);
  assert.deepEqual(result.applied, ['0001_reader_accounts.sql', '0002_verified_identity_progress_knowledge.sql']);
  assert.equal(f.db.prepare('SELECT content FROM novel').get().content, 'keep me');
  assert.deepEqual(f.db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map((r) => r.name),
    ['0001_reader_accounts.sql', '0002_verified_identity_progress_knowledge.sql']);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('reader_users') WHERE name = 'password_hash'").get().n, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('reader_sessions') WHERE name = 'auth_method'").get().n, 1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM reader_library_state').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM story_entities').get().n, 9);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM story_relations').get().n, 4);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM story_events').get().n, 3);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM story_chapter_fts').get().n, 1);
  assert.ok(f.logs.some((line) => line.includes('Verified: password auth')));
  const migration = f.requests.map((r) => r.options.body && JSON.parse(r.options.body).sql)
    .find((sql) => sql?.includes('ALTER TABLE reader_users ADD COLUMN password_hash'));
  assert.ok(migration.includes("INSERT INTO d1_migrations"));
});

test('rerun skips both migrations and preserves users, bookmarks, and reader state', async (t) => {
  const f = await fixture(t);
  await f.run(['--apply']);
  f.db.exec(`
    INSERT INTO reader_users (id,email,created_at,password_hash,password_salt,password_iterations,registered_at)
    VALUES ('u1','test@example.test',1,'hash','salt',600000,1);
    INSERT INTO reader_bookmarks VALUES ('u1','novel-1','chapter-1',1);
    INSERT INTO reader_library_state (user_id, novel_id, status, last_chapter_id, progress_percent, progress_sync_count, updated_at)
    VALUES ('u1','novel-1','reading','chapter-1',50,2,1);
  `);
  const result = await f.run(['--apply']);
  assert.deepEqual(result.applied, []);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').get().n, 2);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM reader_bookmarks').get().n, 1);
  assert.equal(f.db.prepare('SELECT progress_sync_count AS n FROM reader_library_state').get().n, 2);
});

test('--verify checks the complete current schema without writing', async (t) => {
  const f = await fixture(t);
  f.db.exec(READER_SQL);
  f.db.exec(FEATURE_SQL);
  const before = schema(f.db);
  await f.run(['--verify']);
  assert.deepEqual(schema(f.db), before);
  assert.ok(!tables(f.db).includes('d1_migrations'));
});

test('--verify checks schemas with more tables than SQLite compound-select limits', async (t) => {
  const f = await fixture(t);
  f.db.exec(READER_SQL);
  f.db.exec(FEATURE_SQL);
  for (let i = 0; i < 600; i++) f.db.exec(`CREATE TABLE unrelated_${i} (id INTEGER PRIMARY KEY)`);
  await f.run(['--verify']);
});

test('--verify fails closed on an incomplete current schema', async (t) => {
  const f = await fixture(t);
  f.db.exec(READER_SQL);
  await assert.rejects(f.run(['--verify']), /Reader schema incomplete.*reader_users\.password_hash/);
});

test('database-name mismatch stops before SQL writes', async (t) => {
  const f = await fixture(t);
  const before = schema(f.db);
  await assert.rejects(f.run(['--apply'], { env: { ...ENV, DATABASE_NAME: 'wrong-db' } }), /Database mismatch/);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(schema(f.db), before);
});

test('missing config and invalid provider fail without network calls', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.run(['--apply'], { env: {} }), /Fill CLOUDFLARE_ID/);
  await assert.rejects(f.run(['--apply'], { env: { ...ENV, DATABASE_PROVIDER: 'POSTGRES' } }), /must be D1/);
  assert.equal(f.requests.length, 0);
});

test('account aliases, IDs, tokens, and blank database ID are validated', () => {
  assert.equal(readConfig({ ...ENV, CLOUDFLARE_ID: '', CLOUDFLARE_ACCOUNT_ID: ENV.CLOUDFLARE_ID }).accountId, ENV.CLOUDFLARE_ID);
  assert.throws(() => readConfig({ ...ENV, CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32) }), /disagree/);
  assert.throws(() => readConfig({ ...ENV, CLOUDFLARE_ID: 'bad-id' }), /32-character/);
  assert.throws(() => readConfig({ ...ENV, DATABASE_ID: 'wrong' }), /UUID/);
  assert.throws(() => readConfig({ ...ENV, DATABASE_ID: '' }), /Fill/);
  assert.throws(() => readConfig({ ...ENV, CLOUDFLARE_API_TOKEN: 'Bearer abc' }), /Bearer/);
});

test('unknown/conflicting flags stop before network; help needs no credentials', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.run(['--aplly']), /Use exactly one/);
  await assert.rejects(f.run(['--apply', '--status']), /Use exactly one/);
  await f.run(['--help'], { env: {} });
  assert.equal(f.requests.length, 0);
});

test('SQL error stops later files and does not record the failed migration', async (t) => {
  const f = await fixture(t, {
    '0001_good.sql': 'CREATE TABLE good (id INTEGER);',
    '0002_bad.sql': 'CREATE TABLE rolled_back (id INTEGER); INSERT INTO nonexistent VALUES (1);',
    '0003_never.sql': 'CREATE TABLE never_executed (id INTEGER);',
  });
  await assert.rejects(f.run(['--apply']), /Stopped at 0002_bad.sql.*1 earlier migration/);
  assert.ok(tables(f.db).includes('good'));
  assert.ok(!tables(f.db).includes('rolled_back'));
  assert.ok(!tables(f.db).includes('never_executed'));
  assert.deepEqual(f.db.prepare('SELECT name FROM d1_migrations').all().map((r) => r.name), ['0001_good.sql']);
});

test('multistatement SQL preserves semicolons, trigger bodies, and trailing comments', async (t) => {
  const f = await fixture(t, {
    '0001_custom.sql': `CREATE TABLE notes (text TEXT); CREATE TABLE audit (text TEXT);
CREATE TRIGGER notes_audit AFTER INSERT ON notes BEGIN
  INSERT INTO audit VALUES ('a; b'); INSERT INTO audit VALUES (new.text);
END;
INSERT INTO notes VALUES ('literal; with semicolon'); -- trailing comment`,
  });
  await f.run(['--apply']);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM audit').get().n, 2);
  assert.equal(f.db.prepare('SELECT name FROM d1_migrations').get().name, '0001_custom.sql');
});

test('filename SQL literals are escaped', async (t) => {
  const f = await fixture(t, { "0001_quote'name.sql": 'CREATE TABLE safe (id INTEGER);' });
  await f.run(['--apply']);
  assert.equal(f.db.prepare('SELECT name FROM d1_migrations').get().name, "0001_quote'name.sql");
  assert.ok(migrationBatch("a'b.sql", 'SELECT 1;').includes("'a''b.sql'"));
});

test('HTTP 403 is actionable and never exposes the bearer token', async () => {
  const client = createD1Client(readConfig(ENV), async () => Response.json({
    success: false, errors: [{ code: 10000, message: `denied ${ENV.CLOUDFLARE_API_TOKEN}` }],
  }, { status: 403 }));
  await assert.rejects(client.info(), (error) => {
    assert.match(error.message, /D1 Write/);
    assert.ok(!error.message.includes(ENV.CLOUDFLARE_API_TOKEN));
    return true;
  });
});

test('top-level SQL failure at HTTP 200 is not mistaken for success', async () => {
  const client = createD1Client(readConfig(ENV), async () => Response.json({
    success: false, errors: [{ code: 7500, message: 'SQL failed' }], result: [],
  }));
  await assert.rejects(client.query('SELECT 1'), /SQL failed/);
});

test('per-statement failure and empty result envelope are rejected', async () => {
  let result = [{ success: false, error: 'statement error' }];
  const client = createD1Client(readConfig(ENV), async () => Response.json({ success: true, result }));
  await assert.rejects(client.query('SELECT 1'), /statement error/);
  result = [];
  await assert.rejects(client.query('SELECT 1'), /no query results/);
});

test('timeouts and rate limits are not automatically retried', async () => {
  let count = 0;
  const client = createD1Client(readConfig(ENV), async () => { count++; throw new Error('lost connection'); });
  await assert.rejects(client.query('SELECT 1'), /NOT retried/);
  assert.equal(count, 1);
  const limited = createD1Client(readConfig(ENV), async () => {
    count++;
    return Response.json({ success: false, errors: [] }, { status: 429 });
  });
  await assert.rejects(limited.query('SELECT 1'), /Rate limited/);
  assert.equal(count, 2);
});

test('unreadable responses do not masquerade as success', async () => {
  const client = createD1Client(readConfig(ENV), async () => new Response('not json', { status: 502 }));
  await assert.rejects(client.query('SELECT 1'), /unreadable response.*502/);
});

test('existing history records absent from this checkout are left unchanged', async (t) => {
  const f = await fixture(t);
  f.db.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL); INSERT INTO d1_migrations (name) VALUES ('0000_original_schema.sql');");
  await f.run(['--apply']);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').get().n, 3);
  assert.ok(f.logs.some((line) => line.includes('absent from this folder')));
});

test('manually applied compatible reader schema is recorded then upgraded without losing rows', async (t) => {
  const f = await fixture(t);
  f.db.exec(READER_SQL);
  f.db.exec("INSERT INTO reader_users (id,email,created_at) VALUES ('u1','existing@example.test',1)");
  await f.run(['--apply']);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM reader_users').get().n, 1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').get().n, 2);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('reader_users') WHERE name = 'password_hash'").get().n, 1);
});

test('empty folder/file fail before migration-history writes', async (t) => {
  const emptyFolder = await fixture(t, {});
  await assert.rejects(emptyFolder.run(['--apply']), /No .sql migration/);
  assert.ok(!tables(emptyFolder.db).includes('d1_migrations'));
  const emptyFile = await fixture(t, { '0001_empty.sql': '   ' });
  await assert.rejects(emptyFile.run(['--apply']), /Migration is empty/);
  assert.ok(!tables(emptyFile.db).includes('d1_migrations'));
});

test('CLI loads project-root .env even when launched from another working directory', async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.root, 'scripts'));
  await copyFile(fileURLToPath(new URL('../scripts/migrate-d1.mjs', import.meta.url)), join(f.root, 'scripts', 'migrate-d1.mjs'));
  await writeFile(join(f.root, '.env'), Object.entries(ENV).map(([k, v]) => `${k}=${v}`).join('\n'));
  const preload = join(f.root, 'mock-fetch.mjs');
  await writeFile(preload, `globalThis.fetch = async (url, options) => {
    if (options.headers.Authorization !== 'Bearer ${ENV.CLOUDFLARE_API_TOKEN}') throw new Error('missing token');
    if (options.method === 'GET') return Response.json({ success: true, result: { uuid: '${ENV.DATABASE_ID}', name: 'novel' } });
    const body = JSON.parse(options.body);
    if (!body.sql.startsWith('SELECT')) throw new Error('unexpected write');
    return Response.json({ success: true, result: [{ success: true, results: [] }] });
  };`);
  const cleanEnv = { ...process.env };
  for (const key of [...Object.keys(ENV), 'CLOUDFLARE_ACCOUNT_ID']) delete cleanEnv[key];
  const child = spawnSync(process.execPath, ['--import', preload, join(f.root, 'scripts', 'migrate-d1.mjs'), '--status'], {
    env: cleanEnv, cwd: tmpdir(), encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /REMOTE D1: novel/);
  assert.match(child.stdout, /2 pending/);
  assert.ok(!child.stdout.includes(ENV.CLOUDFLARE_API_TOKEN));
});
