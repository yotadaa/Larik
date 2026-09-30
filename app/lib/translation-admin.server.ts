import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { getLocalDatabasePath, getLocalDatabaseRaw } from "./local-db.server";

const ADMIN_SCHEMA = `
CREATE TABLE IF NOT EXISTS translation_jobs (
  job_id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  lang_id TEXT NOT NULL,
  start_chapter INTEGER NOT NULL,
  end_chapter INTEGER NOT NULL,
  force INTEGER NOT NULL DEFAULT 0,
  allow_context_gap INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','stopping','stopped','completed','failed')),
  pid INTEGER,
  current_chapter INTEGER,
  current_stage TEXT NOT NULL DEFAULT 'queued',
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  log_file TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_translation_jobs_status ON translation_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_translation_jobs_series ON translation_jobs(novel_id, lang_id, status, created_at);
CREATE TABLE IF NOT EXISTS translation_job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  chapter_number INTEGER,
  stage TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES translation_jobs(job_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_translation_job_events_job ON translation_job_events(job_id, id DESC);
CREATE TABLE IF NOT EXISTS translation_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  is_secret INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

type SettingDefinition = {
  key: string;
  label: string;
  group: "connection" | "budget" | "context" | "quality" | "worker";
  type?: "text" | "number" | "password" | "select";
  secret?: boolean;
  defaultValue: string;
  options?: string[];
  help?: string;
};

export const TRANSLATION_SETTING_DEFINITIONS: SettingDefinition[] = [
  { key: "BASE_URL", label: "LLM base URL", group: "connection", defaultValue: "http://127.0.0.1:20128/v1" },
  { key: "API_KEY", label: "API key", group: "connection", type: "password", secret: true, defaultValue: "", help: "Stored server-side in the local SQLite control plane and never sent back to the browser." },
  { key: "MODEL", label: "Model", group: "connection", defaultValue: "" },
  { key: "REASONING_EFFORT", label: "Reasoning effort", group: "connection", type: "select", options: ["", "low", "medium", "high", "max"], defaultValue: "max" },
  { key: "LLM_TOKEN_PARAMETER", label: "Token parameter", group: "connection", type: "select", options: ["max_tokens", "max_completion_tokens"], defaultValue: "max_tokens" },
  { key: "MAX_TOKENS", label: "Max output tokens", group: "budget", type: "number", defaultValue: "49152" },
  { key: "CONTEXT_WINDOW", label: "Context window", group: "budget", type: "number", defaultValue: "272000" },
  { key: "COMPACT_THRESHOLD", label: "Compact threshold", group: "budget", type: "number", defaultValue: "0.80" },
  { key: "SAFETY_MARGIN_TOKENS", label: "Safety margin tokens", group: "budget", type: "number", defaultValue: "16384" },
  { key: "LLM_TIMEOUT_SECONDS", label: "Request timeout (seconds)", group: "budget", type: "number", defaultValue: "600" },
  { key: "LLM_MAX_RETRIES", label: "Max retries", group: "budget", type: "number", defaultValue: "3" },
  { key: "LLM_RETRY_BASE_SECONDS", label: "Retry base seconds", group: "budget", type: "number", defaultValue: "1.5" },
  { key: "PREVIOUS_CHAPTERS", label: "Previous chapters", group: "context", type: "number", defaultValue: "6" },
  { key: "PREVIOUS_FULL_CHAPTERS", label: "Previous full chapters", group: "context", type: "number", defaultValue: "2" },
  { key: "CONTEXT_ENTITY_LIMIT", label: "Entity limit", group: "context", type: "number", defaultValue: "120" },
  { key: "CONTEXT_RELATIONSHIP_LIMIT", label: "Relationship limit", group: "context", type: "number", defaultValue: "160" },
  { key: "CONTEXT_TERMINOLOGY_LIMIT", label: "Terminology limit", group: "context", type: "number", defaultValue: "200" },
  { key: "CONTEXT_GLOSSARY_LIMIT", label: "Glossary limit", group: "context", type: "number", defaultValue: "100" },
  { key: "CONTEXT_ARC_LIMIT", label: "Arc limit", group: "context", type: "number", defaultValue: "6" },
  { key: "TRANSLATION_TEMPERATURE", label: "Translation temperature", group: "quality", type: "number", defaultValue: "0.15" },
  { key: "METADATA_TEMPERATURE", label: "Metadata temperature", group: "quality", type: "number", defaultValue: "0.05" },
  { key: "REPAIR_TEMPERATURE", label: "Repair temperature", group: "quality", type: "number", defaultValue: "0.10" },
  { key: "QUALITY_REVIEW", label: "Quality review", group: "quality", type: "select", options: ["off", "adaptive", "always"], defaultValue: "adaptive" },
  { key: "STRICT_SEQUENTIAL", label: "Strict sequential", group: "quality", type: "select", options: ["true", "false"], defaultValue: "true" },
  { key: "RAW_STORY_ROOT", label: "Raw story root", group: "worker", defaultValue: "story/raw" },
  { key: "ADMIN_MAX_PARALLEL_JOBS", label: "Parallel novel jobs", group: "worker", type: "number", defaultValue: "2", help: "Parallelism is across novels/jobs. Chapters inside one novel always remain sequential." },
  { key: "TRANSLATOR_PYTHON", label: "Python executable", group: "worker", defaultValue: "python" },
  { key: "TRANSLATOR_PROJECT_ROOT", label: "Translator project root", group: "worker", defaultValue: "" },
  { key: "TRANSLATION_LOG_DIR", label: "Job log directory", group: "worker", defaultValue: "logs" },
];

type RawNovel = {
  novelId: string;
  firstChapter: number;
  lastChapter: number;
  rawChapters: number;
  completedChapters: number;
  lastCompletedChapter: number | null;
  suggestedStart: number;
  suggestedEnd: number;
  complete: boolean;
};

type JobEvent = {
  id: number;
  job_id: string;
  chapter_number: number | null;
  stage: string;
  message: string;
  progress_current: number;
  progress_total: number;
  created_at: string;
};

export type TranslationJobView = {
  jobId: string;
  novelId: string;
  langId: string;
  startChapter: number;
  endChapter: number;
  status: string;
  pid: number | null;
  currentChapter: number | null;
  currentStage: string;
  progressCurrent: number;
  progressTotal: number;
  processedCount: number;
  skippedCount: number;
  message: string;
  logFile: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  chapterStates: Record<number, { stage: string; message: string; at: string }>;
  events: Array<{ id: number; chapter: number | null; stage: string; message: string; at: string }>;
};

function db(): DatabaseSync {
  const database = getLocalDatabaseRaw();
  database.exec(ADMIN_SCHEMA);
  seedSettings(database);
  return database;
}

function seedSettings(database: DatabaseSync) {
  const insert = database.prepare("INSERT OR IGNORE INTO translation_settings(key,value,is_secret) VALUES(?,?,?)");
  for (const definition of TRANSLATION_SETTING_DEFINITIONS) {
    const fromEnv = process.env[definition.key];
    insert.run(definition.key, fromEnv ?? definition.defaultValue, definition.secret ? 1 : 0);
  }
}

function settingsMap(database = db()): Record<string, string> {
  const rows = database.prepare("SELECT key,value FROM translation_settings").all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function projectRoot(settings: Record<string, string>) {
  const configured = settings.TRANSLATOR_PROJECT_ROOT?.trim();
  return path.resolve(configured || process.cwd());
}

function resolveFromProject(value: string, root: string) {
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

const CHAPTER_PATTERNS = [
  /(?:^|[-_\s])chapters?[-_\s]*(\d+)(?:\D|$)/i,
  /(?:^|[-_\s])ch[-_\s]*(\d+)(?:\D|$)/i,
  /^(\d+)(?:\D|$)/,
];

function chapterNumber(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, "");
  for (const pattern of CHAPTER_PATTERNS) {
    const match = stem.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function collectChapterNumbers(directory: string): number[] {
  if (!existsSync(directory)) return [];
  const numbers = new Set<number>();
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.(md|txt)$/i.test(entry.name)) {
        const number = chapterNumber(entry.name);
        if (number !== null) numbers.add(number);
      }
    }
  };
  walk(directory);
  return [...numbers].sort((a, b) => a - b);
}

function listRawNovels(database: DatabaseSync, settings: Record<string, string>, langId: string): RawNovel[] {
  const root = projectRoot(settings);
  const rawRoot = resolveFromProject(settings.RAW_STORY_ROOT || "story/raw", root);
  if (!existsSync(rawRoot)) return [];
  const completedRows = database.prepare(
    "SELECT novel_id,chapter_number FROM chapters WHERE lang_id=? AND status='completed' AND stale=0",
  ).all(langId) as Array<{ novel_id: string; chapter_number: number }>;
  const completedByNovel = new Map<string, Set<number>>();
  for (const row of completedRows) {
    const bucket = completedByNovel.get(row.novel_id) ?? new Set<number>();
    bucket.add(Number(row.chapter_number));
    completedByNovel.set(row.novel_id, bucket);
  }

  const novels: RawNovel[] = [];
  for (const entry of readdirSync(rawRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const chapters = collectChapterNumbers(path.join(rawRoot, entry.name));
    if (!chapters.length) continue;
    const completed = completedByNovel.get(entry.name) ?? new Set<number>();
    const missing = chapters.find((number) => !completed.has(number));
    const completedInRaw = chapters.filter((number) => completed.has(number));
    novels.push({
      novelId: entry.name,
      firstChapter: chapters[0],
      lastChapter: chapters[chapters.length - 1],
      rawChapters: chapters.length,
      completedChapters: completedInRaw.length,
      lastCompletedChapter: completedInRaw.length ? completedInRaw[completedInRaw.length - 1] : null,
      suggestedStart: missing ?? chapters[chapters.length - 1],
      suggestedEnd: chapters[chapters.length - 1],
      complete: missing === undefined,
    });
  }
  return novels.sort((a, b) => a.novelId.localeCompare(b.novelId));
}

function pidAlive(pid: number | null) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function reconcileWorkers(database: DatabaseSync) {
  const rows = database.prepare("SELECT job_id,status,pid FROM translation_jobs WHERE status IN ('running','stopping')").all() as Array<{ job_id: string; status: string; pid: number | null }>;
  const update = database.prepare(
    "UPDATE translation_jobs SET status=?,pid=NULL,current_stage=?,message=?,finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE job_id=? AND status IN ('running','stopping')",
  );
  for (const row of rows) {
    if (pidAlive(row.pid)) continue;
    const stopped = row.status === "stopping";
    update.run(stopped ? "stopped" : "failed", stopped ? "stopped" : "failed", stopped ? "Worker stopped" : "Worker exited before reporting a terminal status", row.job_id);
  }
}

function spawnJob(database: DatabaseSync, job: Record<string, unknown>, settings: Record<string, string>) {
  const root = projectRoot(settings);
  const configuredPython = settings.TRANSLATOR_PYTHON?.trim() || "python";
  const python = configuredPython.includes("/") || configuredPython.includes("\\")
    ? resolveFromProject(configuredPython, root)
    : configuredPython;
  const logDir = resolveFromProject(settings.TRANSLATION_LOG_DIR || "logs", root);
  const logFile = path.resolve(logDir, `translate-${String(job.job_id)}.log`);
  const args = [
    "main.py",
    "--root", root,
    "translate", String(job.novel_id),
    "--lang", String(job.lang_id),
    "--start", String(job.start_chapter),
    "--end", String(job.end_chapter),
    "--job-id", String(job.job_id),
    "--log-level", "trace",
    "--log-file", logFile,
  ];
  if (Number(job.force)) args.push("--force");
  if (Number(job.allow_context_gap)) args.push("--allow-context-gap");

  const childEnv: NodeJS.ProcessEnv = { ...process.env, PYTHONUNBUFFERED: "1", DATABASE_PATH: getLocalDatabasePath() };
  for (const definition of TRANSLATION_SETTING_DEFINITIONS) {
    if (definition.key.startsWith("ADMIN_") || definition.key.startsWith("TRANSLATOR_") || definition.key === "TRANSLATION_LOG_DIR") continue;
    const value = settings[definition.key];
    if (value !== undefined) childEnv[definition.key] = value;
  }

  const child = spawn(python, args, {
    cwd: root,
    env: childEnv,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  database.prepare(
    "UPDATE translation_jobs SET status='running',pid=?,log_file=?,current_stage='starting',message='Launching translation worker',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE job_id=?",
  ).run(child.pid ?? null, logFile, String(job.job_id));
  child.once("error", (error) => {
    try {
      db().prepare("UPDATE translation_jobs SET status='failed',pid=NULL,current_stage='failed',message=?,finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE job_id=? AND status='running'")
        .run(`Failed to start worker: ${error.message}`, String(job.job_id));
    } catch (reportError) {
      console.error("Failed to record translation worker spawn error", reportError);
    }
  });
}

export function dispatchQueuedJobs() {
  const database = db();
  reconcileWorkers(database);
  const settings = settingsMap(database);
  const maxParallel = Math.max(1, Math.min(16, Number.parseInt(settings.ADMIN_MAX_PARALLEL_JOBS || "2", 10) || 2));
  const activeRows = database.prepare("SELECT novel_id,lang_id FROM translation_jobs WHERE status IN ('running','stopping')").all() as Array<{ novel_id: string; lang_id: string }>;
  let active = activeRows.length;
  const activeSeries = new Set(activeRows.map((row) => `${row.novel_id}\u0000${row.lang_id}`));
  if (active >= maxParallel) return;

  const queued = database.prepare("SELECT * FROM translation_jobs WHERE status='queued' ORDER BY created_at ASC,job_id ASC").all() as Array<Record<string, unknown>>;
  for (const job of queued) {
    if (active >= maxParallel) break;
    const key = `${String(job.novel_id)}\u0000${String(job.lang_id)}`;
    if (activeSeries.has(key)) continue;
    spawnJob(database, job, settings);
    activeSeries.add(key);
    active += 1;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __larikTranslationScheduler: ReturnType<typeof setInterval> | undefined;
}

export function ensureTranslationScheduler() {
  if (!globalThis.__larikTranslationScheduler) {
    dispatchQueuedJobs();
    const timer = setInterval(() => {
      try {
        dispatchQueuedJobs();
      } catch (error) {
        console.error("translation scheduler failure", error);
      }
    }, 1200);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
    globalThis.__larikTranslationScheduler = timer;
  }
}

export function enqueueTranslationJobs(input: {
  novelIds: string[];
  langId: string;
  ranges: Record<string, { start: number; end: number }>;
  force: boolean;
  allowContextGap: boolean;
}) {
  const database = db();
  const insert = database.prepare(`
    INSERT INTO translation_jobs(
      job_id,novel_id,lang_id,start_chapter,end_chapter,force,allow_context_gap,status,current_stage,message,progress_total
    ) VALUES(?,?,?,?,?,?,?,'queued','queued','Waiting for an available worker slot',?)
  `);
  const activeCheck = database.prepare("SELECT 1 FROM translation_jobs WHERE novel_id=? AND lang_id=? AND status IN ('queued','running','stopping') LIMIT 1");
  const created: string[] = [];
  const skipped: string[] = [];
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const novelId of [...new Set(input.novelIds)]) {
      const range = input.ranges[novelId];
      if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 1 || range.end < range.start) {
        skipped.push(`${novelId}: invalid range`);
        continue;
      }
      if (activeCheck.get(novelId, input.langId)) {
        skipped.push(`${novelId}: an active/queued ${input.langId} job already exists`);
        continue;
      }
      const jobId = randomUUID().replaceAll("-", "");
      insert.run(jobId, novelId, input.langId, range.start, range.end, input.force ? 1 : 0, input.allowContextGap ? 1 : 0, range.end - range.start + 1);
      created.push(jobId);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  dispatchQueuedJobs();
  return { created, skipped };
}

export function stopTranslationJob(jobId: string, force = false) {
  const database = db();
  const row = database.prepare("SELECT job_id,status,pid FROM translation_jobs WHERE job_id=?").get(jobId) as { job_id: string; status: string; pid: number | null } | undefined;
  if (!row) return { ok: false, message: "Job not found" };
  if (!["queued", "running", "stopping"].includes(row.status)) return { ok: false, message: `Job is already ${row.status}` };
  if (row.status === "queued") {
    database.prepare("UPDATE translation_jobs SET status='stopped',current_stage='stopped',message='Stopped before worker start',finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE job_id=?").run(jobId);
    return { ok: true, message: "Queued job stopped" };
  }

  database.prepare("UPDATE translation_jobs SET status='stopping',current_stage='stopping',message=?,updated_at=CURRENT_TIMESTAMP WHERE job_id=?")
    .run(force ? "Force stop requested" : "Stop requested", jobId);
  if (row.pid) {
    const signal: NodeJS.Signals = force ? "SIGKILL" : "SIGTERM";
    try {
      process.kill(-row.pid, signal);
    } catch {
      try { process.kill(row.pid, signal); } catch { /* reconciler will finalize */ }
    }
  }
  if (force) {
    database.prepare("UPDATE translation_jobs SET status='stopped',pid=NULL,current_stage='stopped',message='Force stopped by operator',finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE job_id=?").run(jobId);
  }
  return { ok: true, message: force ? "Force stop sent" : "Stop sent" };
}

export function retryTranslationJob(jobId: string) {
  const database = db();
  const row = database.prepare("SELECT * FROM translation_jobs WHERE job_id=?").get(jobId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const newId = randomUUID().replaceAll("-", "");
  database.prepare(`
    INSERT INTO translation_jobs(job_id,novel_id,lang_id,start_chapter,end_chapter,force,allow_context_gap,status,current_stage,message,progress_total)
    VALUES(?,?,?,?,?,?,?,'queued','queued','Retry queued',?)
  `).run(
    newId,
    String(row.novel_id),
    String(row.lang_id),
    Number(row.start_chapter),
    Number(row.end_chapter),
    Number(row.force ?? 0),
    Number(row.allow_context_gap ?? 0),
    Number(row.end_chapter) - Number(row.start_chapter) + 1,
  );
  dispatchQueuedJobs();
  return newId;
}

export function saveTranslationSettings(formData: FormData) {
  const database = db();
  const current = settingsMap(database);
  const update = database.prepare(`
    INSERT INTO translation_settings(key,value,is_secret,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,is_secret=excluded.is_secret,updated_at=CURRENT_TIMESTAMP
  `);
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const definition of TRANSLATION_SETTING_DEFINITIONS) {
      const raw = formData.get(definition.key);
      if (raw === null) continue;
      const value = String(raw).trim();
      if (definition.secret && !value) continue;
      update.run(definition.key, value, definition.secret ? 1 : 0);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { changed: TRANSLATION_SETTING_DEFINITIONS.filter((definition) => formData.has(definition.key) && (!definition.secret || String(formData.get(definition.key) ?? "").trim())).map((definition) => definition.key), previousParallelism: current.ADMIN_MAX_PARALLEL_JOBS };
}

function jobViews(database: DatabaseSync): TranslationJobView[] {
  const rows = database.prepare("SELECT * FROM translation_jobs ORDER BY created_at DESC,job_id DESC LIMIT 40").all() as Array<Record<string, unknown>>;
  if (!rows.length) return [];
  const ids = rows.map((row) => String(row.job_id));
  const placeholders = ids.map(() => "?").join(",");
  const chapterEvents = database.prepare(`
    SELECT id,job_id,chapter_number,stage,message,progress_current,progress_total,created_at FROM (
      SELECT e.*,
             ROW_NUMBER() OVER (
               PARTITION BY e.job_id,e.chapter_number
               ORDER BY CASE e.stage WHEN 'done' THEN 4 WHEN 'skip' THEN 3 WHEN 'failed' THEN 2 ELSE 1 END DESC, e.id DESC
             ) AS rn
      FROM translation_job_events e
      WHERE e.job_id IN (${placeholders}) AND e.chapter_number IS NOT NULL
    ) WHERE rn=1
  `).all(...ids) as JobEvent[];
  const recentEvents = database.prepare(`
    SELECT id,job_id,chapter_number,stage,message,progress_current,progress_total,created_at FROM (
      SELECT e.*,
             ROW_NUMBER() OVER (PARTITION BY e.job_id ORDER BY e.id DESC) AS rn
      FROM translation_job_events e
      WHERE e.job_id IN (${placeholders})
    ) WHERE rn<=36
    ORDER BY job_id,id DESC
  `).all(...ids) as JobEvent[];

  const statesByJob = new Map<string, JobEvent[]>();
  for (const event of chapterEvents) {
    const bucket = statesByJob.get(event.job_id) ?? [];
    bucket.push(event);
    statesByJob.set(event.job_id, bucket);
  }
  const recentByJob = new Map<string, JobEvent[]>();
  for (const event of recentEvents) {
    const bucket = recentByJob.get(event.job_id) ?? [];
    bucket.push(event);
    recentByJob.set(event.job_id, bucket);
  }

  return rows.map((row) => {
    const chapterStates: TranslationJobView["chapterStates"] = {};
    for (const event of statesByJob.get(String(row.job_id)) ?? []) {
      if (event.chapter_number == null) continue;
      const stage = event.stage === "skip" ? "skipped" : event.stage;
      chapterStates[Number(event.chapter_number)] = { stage, message: event.message, at: event.created_at };
    }
    const events = recentByJob.get(String(row.job_id)) ?? [];
    return {
      jobId: String(row.job_id),
      novelId: String(row.novel_id),
      langId: String(row.lang_id),
      startChapter: Number(row.start_chapter),
      endChapter: Number(row.end_chapter),
      status: String(row.status),
      pid: row.pid == null ? null : Number(row.pid),
      currentChapter: row.current_chapter == null ? null : Number(row.current_chapter),
      currentStage: String(row.current_stage ?? ""),
      progressCurrent: Number(row.progress_current ?? 0),
      progressTotal: Number(row.progress_total ?? 0),
      processedCount: Number(row.processed_count ?? 0),
      skippedCount: Number(row.skipped_count ?? 0),
      message: String(row.message ?? ""),
      logFile: String(row.log_file ?? ""),
      createdAt: String(row.created_at ?? ""),
      startedAt: row.started_at == null ? null : String(row.started_at),
      finishedAt: row.finished_at == null ? null : String(row.finished_at),
      chapterStates,
      events: events.map((event) => ({ id: Number(event.id), chapter: event.chapter_number == null ? null : Number(event.chapter_number), stage: event.stage, message: event.message, at: event.created_at })),
    };
  });
}

export function getTranslationAdminState(langId: string) {
  ensureTranslationScheduler();
  dispatchQueuedJobs();
  const database = db();
  const settings = settingsMap(database);
  const safeSettings = TRANSLATION_SETTING_DEFINITIONS.map((definition) => ({
    ...definition,
    value: definition.secret ? "" : (settings[definition.key] ?? definition.defaultValue),
    configured: definition.secret ? Boolean(settings[definition.key]) : true,
  }));
  const root = projectRoot(settings);
  return {
    databasePath: getLocalDatabasePath(),
    projectRoot: root,
    rawStoryRoot: resolveFromProject(settings.RAW_STORY_ROOT || "story/raw", root),
    langId,
    novels: listRawNovels(database, settings, langId),
    jobs: jobViews(database),
    settings: safeSettings,
    maxParallel: Math.max(1, Number.parseInt(settings.ADMIN_MAX_PARALLEL_JOBS || "2", 10) || 2),
  };
}
